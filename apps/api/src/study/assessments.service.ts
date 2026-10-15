import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AssessmentStatus, Prisma } from '@prisma/client';
import { ASSESSMENT_MIN_LESSONS, ASSESSMENT_QUESTION_COUNT, ErrorCode } from '@studywidbuddy/shared';
import type { AssessmentSummary, AssessmentView } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { AiError, AiProvider } from '../ai/ai-provider';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { ASSESSMENT_QUEUE } from '../queue/queue.module';
import {
  AssessmentEvaluationSchema,
  assessmentEvaluationPrompt,
  assessmentQuestionsPrompt,
  AssessmentQuestionsSchema,
  assessmentScore,
} from './study-ai';
import { StudyService } from './study.service';

export const JOB_ASSESSMENT_QUESTIONS = 'assessment.questions';
export const JOB_ASSESSMENT_EVALUATE = 'assessment.evaluate';
export interface AssessmentJob {
  assessmentId: string;
}

const OPEN: AssessmentStatus[] = [AssessmentStatus.GENERATING, AssessmentStatus.READY, AssessmentStatus.EVALUATING];

const viewInclude = {
  enrollment: { select: { id: true, userId: true, course: { select: { slug: true, title: true } } } },
  questions: {
    orderBy: { position: 'asc' },
    include: { lesson: { select: { position: true, module: { select: { position: true } } } } },
  },
} satisfies Prisma.CourseAssessmentInclude;
type AssessmentRow = Prisma.CourseAssessmentGetPayload<{ include: typeof viewInclude }>;

const FAILURE_MESSAGES: Record<string, string> = {
  QUESTIONS: 'We couldn’t prepare your questions. Try again in a moment.',
  EVALUATION: 'We couldn’t finish your report. Your answers are saved; you can retry.',
};

/**
 * Voice check: questions about finished lessons, answered aloud (or typed), evaluated into a
 * report that stays under the course. Questions use the fast model; evaluation the smart one.
 */
@Injectable()
export class AssessmentsService {
  private readonly logger = new Logger(AssessmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly study: StudyService,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly queue: Queue<AssessmentJob>,
  ) {}

  async list(userId: string, enrollmentId: string): Promise<AssessmentSummary[]> {
    const e = await this.study.enrollment(userId, enrollmentId);
    const rows = await this.prisma.courseAssessment.findMany({
      where: { enrollmentId: e.id },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toSummary(r));
  }

  /** Starts a voice check, or returns the one already in progress. */
  async start(userId: string, enrollmentId: string): Promise<AssessmentView> {
    const e = await this.study.enrollment(userId, enrollmentId);
    const open = await this.prisma.courseAssessment.findFirst({
      where: { enrollmentId: e.id, status: { in: OPEN } },
      select: { id: true },
    });
    if (open) return this.view(userId, open.id);
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'Voice checks aren’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const done = (await this.study.completedIds(e.id)).size;
    if (done < ASSESSMENT_MIN_LESSONS) {
      throw new DomainError(
        ErrorCode.NOT_ENOUGH_PROGRESS,
        `Finish at least ${ASSESSMENT_MIN_LESSONS} lessons first, so there’s something to ask you about.`,
        HttpStatus.CONFLICT,
        { completed: done, required: ASSESSMENT_MIN_LESSONS },
      );
    }
    let id: string;
    try {
      id = (
        await this.prisma.courseAssessment.create({
          data: { enrollmentId: e.id, lessonsCovered: done },
          select: { id: true },
        })
      ).id;
    } catch (err) {
      // Lost a race with a concurrent start (partial unique index): return that one.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const existing = await this.prisma.courseAssessment.findFirstOrThrow({
          where: { enrollmentId: e.id, status: { in: OPEN } },
        });
        return this.view(userId, existing.id);
      }
      throw err;
    }
    await this.enqueue(JOB_ASSESSMENT_QUESTIONS, id);
    return this.view(userId, id);
  }

  async view(userId: string, assessmentId: string): Promise<AssessmentView> {
    const a = await this.prisma.courseAssessment.findUnique({ where: { id: assessmentId }, include: viewInclude });
    if (!a || a.enrollment.userId !== userId) throw notFound('Voice check');
    return this.toView(a);
  }

  async answer(userId: string, assessmentId: string, position: number, answer: string, viaVoice: boolean) {
    const a = await this.owned(userId, assessmentId);
    this.assertStatus(a.status, AssessmentStatus.READY);
    const updated = await this.prisma.assessmentQuestion.updateMany({
      where: { assessmentId, position },
      data: { answer: answer.trim(), viaVoice, answeredAt: new Date() },
    });
    if (updated.count !== 1) throw notFound('Question');
    return this.view(userId, assessmentId);
  }

  /** Locks the answers and queues the report. Every question needs an answer. */
  async submit(userId: string, assessmentId: string): Promise<AssessmentView> {
    const a = await this.prisma.courseAssessment.findUnique({ where: { id: assessmentId }, include: viewInclude });
    if (!a || a.enrollment.userId !== userId) throw notFound('Voice check');
    this.assertStatus(a.status, AssessmentStatus.READY);
    const missing = a.questions.filter((q) => !q.answer?.trim()).map((q) => q.position);
    if (missing.length) {
      throw new DomainError(
        ErrorCode.ASSESSMENT_INCOMPLETE,
        `Answer every question first (missing: ${missing.join(', ')}).`,
        HttpStatus.UNPROCESSABLE_ENTITY,
        { missing },
      );
    }
    const claimed = await this.prisma.courseAssessment.updateMany({
      where: { id: assessmentId, status: AssessmentStatus.READY },
      data: { status: AssessmentStatus.EVALUATING, submittedAt: new Date() },
    });
    if (claimed.count !== 1) this.assertStatus(AssessmentStatus.EVALUATING, AssessmentStatus.READY);
    await this.enqueue(JOB_ASSESSMENT_EVALUATE, assessmentId);
    return this.view(userId, assessmentId);
  }

  async retry(userId: string, assessmentId: string): Promise<AssessmentView> {
    const a = await this.owned(userId, assessmentId);
    this.assertStatus(a.status, AssessmentStatus.FAILED);
    const toQuestions = a.failedStage === 'QUESTIONS';
    // A failed check doesn't count as open, so another may have started meanwhile.
    try {
      await this.prisma.courseAssessment.update({
        where: { id: assessmentId },
        data: {
          status: toQuestions ? AssessmentStatus.GENERATING : AssessmentStatus.EVALUATING,
          failedStage: null,
          failureReason: null,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new DomainError(
          ErrorCode.ASSESSMENT_NOT_READY,
          'Another voice check is already in progress.',
          HttpStatus.CONFLICT,
        );
      }
      throw err;
    }
    await this.enqueue(
      toQuestions ? JOB_ASSESSMENT_QUESTIONS : JOB_ASSESSMENT_EVALUATE,
      assessmentId,
      `retry-${Date.now()}`,
    );
    return this.view(userId, assessmentId);
  }

  /** Abandon an unfinished check (e.g. the learner wants fresh questions). Reports are kept. */
  async discard(userId: string, assessmentId: string): Promise<void> {
    const a = await this.owned(userId, assessmentId);
    if (a.status === AssessmentStatus.EVALUATED || a.status === AssessmentStatus.EVALUATING) {
      throw new DomainError(
        ErrorCode.ASSESSMENT_NOT_READY,
        'This check is already submitted; its report is kept.',
        HttpStatus.CONFLICT,
      );
    }
    await this.prisma.courseAssessment.delete({ where: { id: assessmentId } });
  }

  // ───────── worker steps ─────────

  async generateQuestions(assessmentId: string): Promise<void> {
    const a = await this.prisma.courseAssessment.findUnique({
      where: { id: assessmentId },
      select: { status: true, enrollmentId: true },
    });
    if (!a || a.status !== AssessmentStatus.GENERATING) return;
    const e = await this.prisma.enrollment.findUniqueOrThrow({
      where: { id: a.enrollmentId },
      select: { id: true, userId: true, courseId: true, status: true, level: true },
    });
    const { context, lessons } = await this.study.courseContext(e);
    const prompt = assessmentQuestionsPrompt(context);
    const result = await this.ai.generateStructured({
      purpose: 'assessment.questions',
      userId: e.userId,
      tier: 'fast',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: AssessmentQuestionsSchema,
      maxTokens: 3000,
    });
    // Only completed lessons may be referenced; anything else loses its lesson link.
    const doneByLabel = new Map(
      lessons.filter((l) => context.lessons.find((c) => c.label === l.label)?.completed).map((l) => [l.label, l.id]),
    );
    const questions = result.value.questions.slice(0, ASSESSMENT_QUESTION_COUNT);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.courseAssessment.updateMany({
        where: { id: assessmentId, status: AssessmentStatus.GENERATING },
        data: { status: AssessmentStatus.READY },
      });
      if (claimed.count !== 1) return;
      await tx.assessmentQuestion.createMany({
        data: questions.map((q, i) => ({
          assessmentId,
          position: i + 1,
          lessonId: doneByLabel.get(q.lessonLabel.trim()) ?? null,
          focus: q.focus.trim(),
          prompt: q.prompt.trim(),
        })),
      });
    });
  }

  async evaluate(assessmentId: string): Promise<void> {
    const a = await this.prisma.courseAssessment.findUnique({ where: { id: assessmentId }, include: viewInclude });
    if (!a || a.status !== AssessmentStatus.EVALUATING) return;
    const e = await this.prisma.enrollment.findUniqueOrThrow({
      where: { id: a.enrollmentId },
      select: { id: true, userId: true, courseId: true, status: true, level: true },
    });
    const { context } = await this.study.courseContext(e);
    const prompt = assessmentEvaluationPrompt(
      context,
      a.questions.map((q) => ({
        position: q.position,
        lessonLabel: q.lesson ? `${q.lesson.module.position}.${q.lesson.position}` : null,
        focus: q.focus,
        prompt: q.prompt,
        answer: q.answer ?? '',
        viaVoice: q.viaVoice,
      })),
    );
    const result = await this.ai.generateStructured({
      purpose: 'assessment.evaluation',
      userId: e.userId,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: AssessmentEvaluationSchema,
      effort: 'medium',
      maxTokens: 6000,
    });
    const v = result.value;
    const byPosition = new Map(v.answers.map((x) => [x.position, x]));
    const missing = a.questions.filter((q) => !byPosition.has(q.position)).map((q) => q.position);
    if (missing.length) {
      throw new AiError('INVALID_OUTPUT', `Evaluation skipped question(s) ${missing.join(', ')}`);
    }
    const labels = new Set(context.lessons.map((l) => l.label));
    const scores = a.questions.map((q) => byPosition.get(q.position)!.score);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.courseAssessment.updateMany({
        where: { id: assessmentId, status: AssessmentStatus.EVALUATING },
        data: {
          status: AssessmentStatus.EVALUATED,
          evaluatedAt: new Date(),
          overallScore: assessmentScore(scores),
          summary: v.summary.trim(),
          strengths: v.strengths.map((s) => s.trim()),
          gaps: v.gaps.map((s) => s.trim()),
          reviewLessons: [...new Set(v.reviewLessons.map((l) => l.trim()).filter((l) => labels.has(l)))],
          aiModel: result.model,
        },
      });
      if (claimed.count !== 1) return;
      for (const q of a.questions) {
        const r = byPosition.get(q.position)!;
        await tx.assessmentQuestion.update({
          where: { id: q.id },
          data: { score: r.score, feedback: r.feedback.trim(), modelAnswer: r.modelAnswer.trim() },
        });
      }
    });
  }

  async markFailed(assessmentId: string, jobName: string, error: unknown): Promise<void> {
    const stage = jobName === JOB_ASSESSMENT_QUESTIONS ? 'QUESTIONS' : 'EVALUATION';
    const from = stage === 'QUESTIONS' ? AssessmentStatus.GENERATING : AssessmentStatus.EVALUATING;
    const reason =
      error instanceof AiError ? `${error.kind}: ${error.message}` : String((error as Error)?.message ?? error);
    this.logger.warn(`Voice check ${assessmentId} ${stage.toLowerCase()} failed: ${reason}`);
    await this.prisma.courseAssessment.updateMany({
      where: { id: assessmentId, status: from },
      data: { status: AssessmentStatus.FAILED, failedStage: stage, failureReason: reason.slice(0, 500) },
    });
  }

  // ───────── helpers ─────────

  private async owned(userId: string, assessmentId: string) {
    const a = await this.prisma.courseAssessment.findUnique({
      where: { id: assessmentId },
      select: { id: true, status: true, failedStage: true, enrollment: { select: { userId: true } } },
    });
    if (!a || a.enrollment.userId !== userId) throw notFound('Voice check');
    return a;
  }

  private async enqueue(name: string, assessmentId: string, suffix = 'initial') {
    await this.queue.add(name, { assessmentId }, { jobId: `${name}-${assessmentId}-${suffix}` });
  }

  private assertStatus(actual: AssessmentStatus, expected: AssessmentStatus) {
    if (actual === expected) return;
    const msg: Partial<Record<AssessmentStatus, string>> = {
      GENERATING: 'Your questions are still being prepared.',
      READY: 'This voice check is still open.',
      EVALUATING: 'Your answers are submitted; the report is being written.',
      EVALUATED: 'This voice check is finished.',
      FAILED: 'This voice check hit a problem. Retry it first.',
    };
    throw new DomainError(
      ErrorCode.ASSESSMENT_NOT_READY,
      msg[actual] ?? 'Not possible right now.',
      HttpStatus.CONFLICT,
      {
        status: actual,
      },
    );
  }

  private toSummary(a: {
    id: string;
    status: AssessmentStatus;
    lessonsCovered: number;
    overallScore: number | null;
    createdAt: Date;
    evaluatedAt: Date | null;
  }): AssessmentSummary {
    return {
      id: a.id,
      status: a.status,
      lessonsCovered: a.lessonsCovered,
      overallScore: a.status === AssessmentStatus.EVALUATED ? a.overallScore : null,
      createdAt: a.createdAt.toISOString(),
      evaluatedAt: a.evaluatedAt?.toISOString() ?? null,
    };
  }

  private toView(a: AssessmentRow): AssessmentView {
    const evaluated = a.status === AssessmentStatus.EVALUATED;
    return {
      ...this.toSummary(a),
      enrollmentId: a.enrollment.id,
      course: a.enrollment.course,
      failureMessage:
        a.status === AssessmentStatus.FAILED ? (FAILURE_MESSAGES[a.failedStage ?? 'QUESTIONS'] ?? null) : null,
      summary: evaluated ? a.summary : null,
      strengths: evaluated ? a.strengths : [],
      gaps: evaluated ? a.gaps : [],
      reviewLessons: evaluated ? a.reviewLessons : [],
      questions: a.questions.map((q) => ({
        position: q.position,
        focus: q.focus,
        prompt: q.prompt,
        lessonLabel: q.lesson ? `${q.lesson.module.position}.${q.lesson.position}` : null,
        answer: q.answer,
        viaVoice: q.viaVoice,
        score: evaluated ? q.score : null,
        feedback: evaluated ? q.feedback : null,
        modelAnswer: evaluated ? q.modelAnswer : null,
      })),
    };
  }
}
