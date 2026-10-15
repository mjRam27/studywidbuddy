import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import {
  ApplicationStatus,
  CvScreeningStatus,
  InterviewQuestionKind,
  InterviewStatus,
  Prisma,
  ProjectStatus,
  TeamMemberStatus,
} from '@prisma/client';
import { CV_PASS_SCORE, ErrorCode, INTERVIEW_PASS_SCORE } from '@studywidbuddy/shared';
import type {
  InterviewSlots,
  InterviewTurnRequest,
  InterviewTurnResponse,
  InterviewTurnView,
  InterviewView,
} from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { ActivityService } from '../activity/activity.service';
import { AiError, AiProvider } from '../ai/ai-provider';
import { ApplicationsService, LIVE_STATUSES } from '../applications/applications.service';
import type { AuthUser } from '../common/auth/auth-user';
import { ENV, type Env } from '../common/config/env';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { Mailer } from '../mail/mailer';
import { INTERVIEW_QUEUE } from '../queue/queue.module';
import {
  CvScreenSchema,
  cvScreenPrompt,
  EvaluationSchema,
  evaluationPrompt,
  type InterviewContext,
  type InterviewPlan,
  interviewPlanPrompt,
  InterviewPlanSchema,
  interviewTurnPrompt,
  InterviewTurnSchema,
} from './interview-ai';
import { type Move, mustClose, nextMove, remainingTopics } from './interview-flow';
import { canJoin, interviewSlots, isMissed, safeTimezone } from './interview-schedule';
import { atsScore, clampScore, overallScore } from './scoring';

export const JOB_EVALUATE = 'interview.evaluate';
export interface InterviewJob {
  sessionId?: string;
  applicationId?: string;
}

interface StoredPlan extends InterviewPlan {
  used: number[];
}

const viewInclude = {
  application: {
    select: {
      id: true,
      userId: true,
      status: true,
      project: { select: { slug: true, title: true, difficulty: true } },
      role: { select: { id: true, title: true } },
    },
  },
  questions: { orderBy: { position: 'asc' }, include: { response: true } },
  evaluation: { include: { recommendedRole: { select: { id: true, title: true } } } },
} satisfies Prisma.InterviewSessionInclude;
type SessionRow = Prisma.InterviewSessionGetPayload<{ include: typeof viewInclude }>;

const SEATED: TeamMemberStatus[] = [TeamMemberStatus.INVITED, TeamMemberStatus.ACTIVE];

/**
 * CV screening and the live voice interview.
 *
 * Apply (CV) → AI ATS screening (≥ 80 → interview; else feedback + courses)
 *   → candidate books "now" or a slot in the next 5 days
 *   → live voice call: introduction, planned topics with follow-ups (the model proposes,
 *     interview-flow.ts decides) → evaluation (smart model; overall computed by code)
 *   → ≥ 60: seat in the role, first come first served (a full role closes and the rest are
 *     pointed to similar projects); else feedback + courses.
 */
@Injectable()
export class InterviewsService {
  private readonly logger = new Logger(InterviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly applications: ApplicationsService,
    private readonly activity: ActivityService,
    private readonly mailer: Mailer,
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(INTERVIEW_QUEUE) private readonly queue: Queue<InterviewJob>,
  ) {}

  // ───────── CV screening (worker) ─────────

  async screenCv(applicationId: string): Promise<void> {
    const s = await this.prisma.cvScreening.findUnique({
      where: { applicationId },
      select: { status: true, application: { select: { status: true, roleId: true } } },
    });
    // Idempotency: a duplicate or late job for a finished screening does nothing.
    if (!s || s.status !== CvScreeningStatus.PENDING || s.application.status !== ApplicationStatus.SUBMITTED) return;
    if (!this.ai.isConfigured()) throw new AiError('NOT_CONFIGURED', 'AI is not configured.');

    const cv = await this.prisma.applicationCv.findUniqueOrThrow({ where: { applicationId } });
    const ctx = await this.context(applicationId);
    const prompt = cvScreenPrompt(ctx.context);
    const result = await this.ai.generateStructured({
      purpose: 'cv.screen',
      userId: ctx.userId,
      system: prompt.system,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'document',
              source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(cv.data).toString('base64') },
              title: 'Candidate CV',
            },
            { type: 'text', text: prompt.user },
          ],
        },
      ],
      schema: CvScreenSchema,
      effort: 'medium',
      maxTokens: 6000,
    });
    const v = result.value;
    // Skill lists may only name the role's real required skills.
    const required = ctx.context.role.requiredSkills.map((r) => r.name);
    const only = (xs: string[]) =>
      [
        ...new Set(xs.map((x) => required.find((r) => r.toLowerCase() === x.trim().toLowerCase())).filter(Boolean)),
      ] as string[];
    const sub = {
      skillsScore: clampScore(v.skillsScore),
      experienceScore: clampScore(v.experienceScore),
      keywordsScore: clampScore(v.keywordsScore),
      projectsScore: clampScore(v.projectsScore),
      clarityScore: clampScore(v.clarityScore),
    };
    const ats = atsScore(sub);
    const passed = ats >= CV_PASS_SCORE;

    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.cvScreening.updateMany({
        where: { applicationId, status: CvScreeningStatus.PENDING },
        data: {
          status: CvScreeningStatus.DONE,
          ...sub,
          atsScore: ats,
          matchedSkills: only(v.matchedSkills),
          missingSkills: only(v.missingSkills),
          candidateSummary: v.candidateSummary.trim(),
          feedback: v.feedback.trim(),
          aiModel: result.model,
          completedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return false;
      if (passed) {
        await this.applications.transitionIn(
          tx,
          applicationId,
          ApplicationStatus.INTERVIEW_PENDING,
          null,
          () => undefined,
        );
        await tx.interviewSession.create({ data: { applicationId, status: InterviewStatus.AWAITING_SCHEDULE } });
      } else {
        await this.applications.transitionIn(tx, applicationId, ApplicationStatus.REJECTED, null, () => undefined, {
          reason: 'CV_BELOW_THRESHOLD',
          feedback: v.feedback.trim(),
        });
      }
      return true;
    });
    if (!done) return;
    await this.notify(
      applicationId,
      passed ? 'You’re invited to a voice interview' : 'Your CV feedback',
      passed
        ? `Your CV scored ${ats}/100 for ${ctx.context.role.title} on ${ctx.context.project.title}, above the ${CV_PASS_SCORE} needed. Book your voice interview (start now, or pick a time in the next 5 days):`
        : `Your CV scored ${ats}/100 for ${ctx.context.role.title} on ${ctx.context.project.title}. ${CV_PASS_SCORE} is needed for an interview. We've written feedback and picked courses that cover what's missing:`,
    );
  }

  async markScreenFailed(applicationId: string, error: unknown) {
    this.logger.warn(`CV screening ${applicationId} failed: ${(error as Error)?.message ?? error}`);
    await this.prisma.cvScreening.updateMany({
      where: { applicationId, status: CvScreeningStatus.PENDING },
      data: {
        status: CvScreeningStatus.FAILED,
        failureReason: String((error as Error)?.message ?? error).slice(0, 500),
      },
    });
  }

  // ───────── booking ─────────

  async slots(user: AuthUser, sessionId: string): Promise<InterviewSlots> {
    const s = await this.owned(user, sessionId);
    this.assertBookable(s.status);
    const profile = await this.prisma.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
    const timezone = safeTimezone(profile?.timezone);
    return { now: true, slots: interviewSlots(new Date(), timezone), timezone };
  }

  async schedule(user: AuthUser, sessionId: string, at: string): Promise<InterviewView> {
    const s = await this.owned(user, sessionId);
    this.assertBookable(s.status);
    const now = new Date();
    let when: Date;
    if (at === 'now') {
      when = now;
    } else {
      const profile = await this.prisma.profile.findUnique({ where: { userId: user.id }, select: { timezone: true } });
      const allowed = interviewSlots(now, safeTimezone(profile?.timezone));
      const iso = new Date(at).toISOString();
      if (Number.isNaN(Date.parse(at)) || !allowed.includes(iso)) {
        throw new DomainError(
          ErrorCode.INTERVIEW_NOT_SCHEDULABLE,
          'That time isn’t available. Pick one of the listed slots.',
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
      }
      when = new Date(iso);
    }
    const updated = await this.prisma.interviewSession.updateMany({
      where: { id: sessionId, status: { in: [InterviewStatus.AWAITING_SCHEDULE, InterviewStatus.SCHEDULED] } },
      data: { status: InterviewStatus.SCHEDULED, scheduledFor: when },
    });
    if (updated.count !== 1) this.assertBookable(InterviewStatus.LIVE);
    if (at !== 'now') {
      await this.notify(
        s.application.id,
        'Your voice interview is booked',
        `Your interview is booked for ${when.toUTCString()}. You can join from 10 minutes before. Use Chrome or Edge with a microphone, somewhere quiet. Join here:`,
        `/applications/${s.application.id}/interview`,
      );
    }
    return this.view(user, sessionId);
  }

  /** Booking or rebooking is allowed until the call starts. */
  private assertBookable(status: InterviewStatus) {
    if (status !== InterviewStatus.AWAITING_SCHEDULE && status !== InterviewStatus.SCHEDULED) {
      throw new DomainError(
        ErrorCode.INTERVIEW_NOT_SCHEDULABLE,
        'This interview has already started or finished.',
        HttpStatus.CONFLICT,
      );
    }
  }

  // ───────── the live call ─────────

  /** Joins the booked call: writes the plan and returns the interviewer's opening words. */
  async start(user: AuthUser, sessionId: string): Promise<InterviewView> {
    const s = await this.owned(user, sessionId);
    if (s.status === InterviewStatus.LIVE) return this.view(user, sessionId); // reload / second tab
    if (s.status !== InterviewStatus.SCHEDULED || !canJoin(s.scheduledFor, new Date())) {
      throw new DomainError(
        ErrorCode.INTERVIEW_NOT_JOINABLE,
        isMissed(s.scheduledFor, new Date())
          ? 'You missed this slot. Book a new time.'
          : 'Your interview isn’t open yet. You can join from 10 minutes before your slot.',
        HttpStatus.CONFLICT,
      );
    }
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'AI interviews aren’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const claimed = await this.prisma.interviewSession.updateMany({
      where: { id: sessionId, status: InterviewStatus.SCHEDULED },
      data: { status: InterviewStatus.LIVE, startedAt: new Date() },
    });
    if (claimed.count !== 1) return this.view(user, sessionId);

    try {
      const ctx = await this.context(s.application.id);
      const prompt = interviewPlanPrompt(ctx.context);
      const result = await this.ai.generateStructured({
        purpose: 'interview.plan',
        userId: user.id,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        schema: InterviewPlanSchema,
        effort: 'low',
        maxTokens: 4000,
      });
      const plan: StoredPlan = { ...result.value, used: [] };
      await this.prisma.$transaction(async (tx) => {
        await tx.interviewSession.update({
          where: { id: sessionId },
          data: { plan: plan as unknown as Prisma.InputJsonValue, aiModel: result.model },
        });
        await tx.interviewQuestion.create({
          data: {
            sessionId,
            position: 1,
            kind: InterviewQuestionKind.INTRODUCTION,
            focus: 'Introduction',
            prompt: plan.opening.trim(),
          },
        });
        await this.applications.transitionIn(
          tx,
          s.application.id,
          ApplicationStatus.INTERVIEW_IN_PROGRESS,
          user.id,
          () => undefined,
        );
      });
    } catch (e) {
      // Couldn't prepare the call: put the booking back so the candidate can try again.
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { status: InterviewStatus.SCHEDULED, startedAt: null },
      });
      throw e;
    }
    return this.view(user, sessionId);
  }

  /** Records the spoken answer to the current question and returns what the interviewer says next. */
  async turn(user: AuthUser, sessionId: string, req: InterviewTurnRequest): Promise<InterviewTurnResponse> {
    const s = await this.prisma.interviewSession.findUnique({ where: { id: sessionId }, include: viewInclude });
    if (!s || s.application.userId !== user.id) throw notFound('Interview');
    if (s.status !== InterviewStatus.LIVE || !s.plan) {
      throw new DomainError(ErrorCode.INTERVIEW_NOT_READY, 'This interview isn’t live.', HttpStatus.CONFLICT);
    }
    const current = [...s.questions].reverse().find((q) => !q.response);
    if (!current || current.position !== req.position) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'That answer was already recorded. Reload to continue.',
        HttpStatus.CONFLICT,
      );
    }
    const answer = req.answer.trim() || '(no answer)';
    try {
      await this.prisma.interviewResponse.create({
        data: {
          questionId: current.id,
          answer: answer.slice(0, 5000),
          viaVoice: true,
          thinkMs: req.thinkMs ?? null,
          speakMs: req.speakMs ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(ErrorCode.CONFLICT, 'That answer was already recorded.', HttpStatus.CONFLICT);
      }
      throw e;
    }
    if (req.focusLost) {
      await this.prisma.interviewSession.update({
        where: { id: sessionId },
        data: { focusLost: { increment: Math.min(req.focusLost, 50) } },
      });
    }

    const plan = s.plan as unknown as StoredPlan;
    const answered = s.questions.filter((q) => q.response).length + 1;
    const state = {
      usedTopics: plan.used,
      topicCount: plan.topics.length,
      answers: answered,
      lastWasFollowUp: current.kind === InterviewQuestionKind.FOLLOW_UP,
      startedAt: s.startedAt ?? new Date(),
      now: new Date(),
    };
    let proposed: Move | null = null;
    if (!mustClose(state)) {
      try {
        const ctx = await this.context(s.application.id);
        const transcript = [
          ...s.questions
            .filter((q) => q.response)
            .map((q) => ({ kind: q.kind, focus: q.focus, prompt: q.prompt, answer: q.response!.answer })),
          { kind: current.kind, focus: current.focus, prompt: current.prompt, answer },
        ];
        const prompt = interviewTurnPrompt(ctx.context, plan, transcript, {
          remainingTopics: remainingTopics(state),
          mustClose: false,
          followUpAllowed: !state.lastWasFollowUp,
        });
        const out = await this.ai.generateStructured({
          purpose: 'interview.turn',
          userId: user.id,
          tier: 'fast',
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          schema: InterviewTurnSchema,
          maxTokens: 800,
        });
        const v = out.value;
        proposed =
          v.action === 'NEXT_TOPIC'
            ? { action: 'NEXT_TOPIC', topicIndex: v.topicIndex ?? -1, say: v.say }
            : { action: v.action, say: v.say };
      } catch (e) {
        // Keep the call going on the planned questions if the AI hiccups mid-interview.
        this.logger.warn(`Interview ${sessionId}: turn fell back to the plan (${(e as Error).message})`);
      }
    }
    const move = nextMove(state, proposed, (i) => plan.topics[i].question);

    if (move.action === 'CLOSE') {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.interviewSession.updateMany({
          where: { id: sessionId, status: InterviewStatus.LIVE },
          data: { status: InterviewStatus.SUBMITTED, submittedAt: new Date(), closingRemark: move.say },
        });
        if (claimed.count !== 1) return;
        await this.applications.transitionIn(
          tx,
          s.application.id,
          ApplicationStatus.UNDER_REVIEW,
          user.id,
          () => undefined,
        );
      });
      await this.enqueue(JOB_EVALUATE, { sessionId }, sessionId);
      return { next: null, closingRemark: move.say, done: true };
    }

    const topic = move.action === 'NEXT_TOPIC' ? plan.topics[move.topicIndex] : null;
    const created = await this.prisma.$transaction(async (tx) => {
      if (topic && move.action === 'NEXT_TOPIC') {
        await tx.interviewSession.update({
          where: { id: sessionId },
          data: { plan: { ...plan, used: [...plan.used, move.topicIndex] } as unknown as Prisma.InputJsonValue },
        });
      }
      return tx.interviewQuestion.create({
        data: {
          sessionId,
          position: current.position + 1,
          kind: topic ? topic.kind : InterviewQuestionKind.FOLLOW_UP,
          focus: (topic ? topic.focus : current.focus).slice(0, 80),
          prompt: move.say.slice(0, 600),
        },
      });
    });
    return { next: this.toTurn(created, null), closingRemark: null, done: false };
  }

  // ───────── evaluation (worker) ─────────

  async evaluate(sessionId: string): Promise<void> {
    const s = await this.prisma.interviewSession.findUnique({ where: { id: sessionId }, include: viewInclude });
    if (!s || s.status !== InterviewStatus.SUBMITTED || s.evaluation) return;

    const ctx = await this.context(s.application.id);
    const prompt = evaluationPrompt(
      ctx.context,
      s.questions
        .filter((q) => q.response)
        .map((q) => ({
          position: q.position,
          kind: q.kind,
          focus: q.focus,
          prompt: q.prompt,
          answer: q.response!.answer,
        })),
    );
    const result = await this.ai.generateStructured({
      purpose: 'interview.evaluation',
      userId: ctx.userId,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: EvaluationSchema,
      effort: 'high',
      maxTokens: 8000,
    });
    const v = result.value;
    const sub = {
      technicalScore: clampScore(v.technicalScore),
      problemSolvingScore: clampScore(v.problemSolvingScore),
      communicationScore: clampScore(v.communicationScore),
      projectFitScore: clampScore(v.projectFitScore),
    };
    const overall = overallScore(sub);
    const roleId = v.recommendedRoleKey ? (ctx.roleIdsByKey.get(v.recommendedRoleKey) ?? null) : null;

    const stored = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.interviewSession.updateMany({
        where: { id: sessionId, status: InterviewStatus.SUBMITTED },
        data: { status: InterviewStatus.EVALUATED, evaluatedAt: new Date() },
      });
      if (claimed.count !== 1) return false;
      await tx.candidateEvaluation.create({
        data: {
          sessionId,
          ...sub,
          overallScore: overall,
          recommendedRoleId: roleId,
          strengths: v.strengths.map((x) => x.trim()),
          areasToImprove: v.areasToImprove.map((x) => x.trim()),
          summary: v.summary.trim(),
          aiModel: result.model,
        },
      });
      return true;
    });
    if (!stored) return;

    if (overall >= INTERVIEW_PASS_SCORE) {
      const seated = await this.assignSeat(s.application.id);
      await this.notify(
        s.application.id,
        seated ? 'You’re on the team!' : 'The role filled up',
        seated
          ? `Your interview scored ${overall}/100: you have a seat as ${s.application.role.title} on ${s.application.project.title}. Your team workspace is ready:`
          : `Your interview scored ${overall}/100, above the ${INTERVIEW_PASS_SCORE} needed, but the ${s.application.role.title} seats filled up first. We've listed open projects with the same role:`,
      );
    } else {
      await this.applications.transition(s.application.id, ApplicationStatus.REJECTED, null, () => undefined, {
        reason: 'INTERVIEW_BELOW_THRESHOLD',
        feedback: v.summary.trim(),
      });
      await this.notify(
        s.application.id,
        'Your interview feedback',
        `Your interview scored ${overall}/100; ${INTERVIEW_PASS_SCORE} is needed for a seat. Your feedback and recommended courses are ready:`,
      );
    }
  }

  /**
   * First come, first served: lock the role, take a free seat if there is one. When the
   * last seat goes, the role closes: other applicants who haven't started their call are
   * told it filled (with similar projects); when every role is full the project starts.
   * Returns false if the role was already full.
   */
  async assignSeat(applicationId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const app = await tx.projectApplication.findUniqueOrThrow({
        where: { id: applicationId },
        select: {
          id: true,
          userId: true,
          roleId: true,
          projectId: true,
          role: { select: { title: true, seats: true } },
        },
      });
      await tx.$queryRaw`SELECT 1 FROM "ProjectRole" WHERE "id" = ${app.roleId}::uuid FOR UPDATE`;
      const taken = await this.applications.seatsTaken(tx, app.roleId);
      if (taken >= app.role.seats) {
        await this.applications.transitionIn(tx, applicationId, ApplicationStatus.REJECTED, null, () => undefined, {
          reason: 'ROLE_FILLED',
          feedback: `You passed, but every ${app.role.title} seat on this project was taken before your interview finished.`,
        });
        return false;
      }
      const team = await tx.team.upsert({
        where: { projectId: app.projectId },
        create: { projectId: app.projectId },
        update: {},
      });
      await tx.teamMember.create({
        data: {
          teamId: team.id,
          userId: app.userId,
          roleId: app.roleId,
          applicationId,
          status: TeamMemberStatus.ACTIVE,
          respondedAt: new Date(),
        },
      });
      await this.applications.transitionIn(tx, applicationId, ApplicationStatus.SELECTED, null, () => undefined);
      await this.activity.record(
        {
          projectId: app.projectId,
          type: 'MEMBER_JOINED',
          actorUserId: app.userId,
          summary: `joined the team as ${app.role.title} after the AI interview`,
        },
        tx,
      );

      if (taken + 1 >= app.role.seats) await this.closeRole(tx, app.roleId, app.role.title, applicationId);
      await this.startProjectIfFull(tx, app.projectId);
      return true;
    });
  }

  /** The role is full: applications that haven't started their call end as ROLE_FILLED. */
  private async closeRole(tx: Prisma.TransactionClient, roleId: string, roleTitle: string, exceptId: string) {
    const others = await tx.projectApplication.findMany({
      where: {
        roleId,
        id: { not: exceptId },
        status: { in: LIVE_STATUSES },
        // Someone mid-call finishes it; their evaluation will find the role full.
        NOT: { interview: { status: { in: [InterviewStatus.LIVE, InterviewStatus.SUBMITTED] } } },
      },
      select: { id: true },
    });
    for (const o of others) {
      await this.applications.transitionIn(tx, o.id, ApplicationStatus.REJECTED, null, () => undefined, {
        reason: 'ROLE_FILLED',
        feedback: `All ${roleTitle} seats on this project have been filled.`,
      });
    }
  }

  private async startProjectIfFull(tx: Prisma.TransactionClient, projectId: string) {
    const roles = await tx.projectRole.findMany({
      where: { projectId },
      select: { seats: true, _count: { select: { members: { where: { status: { in: SEATED } } } } } },
    });
    if (roles.length && roles.every((r) => r._count.members >= r.seats)) {
      await tx.project.updateMany({
        where: { id: projectId, status: ProjectStatus.OPEN },
        data: { status: ProjectStatus.IN_PROGRESS, startsAt: new Date() },
      });
    }
  }

  async markFailed(sessionId: string, error: unknown): Promise<void> {
    const reason =
      error instanceof AiError ? `${error.kind}: ${error.message}` : String((error as Error)?.message ?? error);
    this.logger.warn(`Interview ${sessionId} evaluation failed: ${reason}`);
    await this.prisma.interviewSession.updateMany({
      where: { id: sessionId, status: InterviewStatus.SUBMITTED },
      data: { status: InterviewStatus.FAILED, failedStage: 'EVALUATION', failureReason: reason.slice(0, 500) },
    });
  }

  /** Re-queues an evaluation that failed. Answers are kept. */
  async retry(user: AuthUser, sessionId: string): Promise<InterviewView> {
    const s = await this.owned(user, sessionId);
    if (s.status !== InterviewStatus.FAILED) {
      throw new DomainError(ErrorCode.INTERVIEW_NOT_READY, 'This interview didn’t fail.', HttpStatus.CONFLICT);
    }
    await this.prisma.interviewSession.update({
      where: { id: sessionId },
      data: { status: InterviewStatus.SUBMITTED, failedStage: null, failureReason: null },
    });
    await this.enqueue(JOB_EVALUATE, { sessionId }, `${sessionId}-retry-${Date.now()}`);
    return this.view(user, sessionId);
  }

  // ───────── views ─────────

  async view(viewer: AuthUser, sessionId: string): Promise<InterviewView> {
    const s = await this.prisma.interviewSession.findUnique({ where: { id: sessionId }, include: viewInclude });
    if (!s || (s.application.userId !== viewer.id && viewer.role !== 'ADMIN')) throw notFound('Interview');
    return this.toView(s, viewer.role === 'ADMIN');
  }

  async viewByApplication(viewer: AuthUser, applicationId: string): Promise<InterviewView> {
    const s = await this.prisma.interviewSession.findUnique({ where: { applicationId }, select: { id: true } });
    if (!s) throw notFound('Interview');
    return this.view(viewer, s.id);
  }

  private toTurn(
    q: { position: number; kind: InterviewQuestionKind; focus: string; prompt: string },
    answer: string | null,
  ): InterviewTurnView {
    return { position: q.position, kind: q.kind, focus: q.focus, prompt: q.prompt, answer };
  }

  private toView(s: SessionRow, admin: boolean): InterviewView {
    const answered = s.questions.filter((q) => q.response);
    const current =
      s.status === InterviewStatus.LIVE ? ([...s.questions].reverse().find((q) => !q.response) ?? null) : null;
    const thinks = answered.map((q) => q.response!.thinkMs).filter((x): x is number => typeof x === 'number');
    const e = s.evaluation;
    return {
      id: s.id,
      applicationId: s.application.id,
      status: s.status,
      failureMessage:
        s.status === InterviewStatus.FAILED
          ? 'We couldn’t finish evaluating your interview. Your answers are saved; you can retry the evaluation.'
          : null,
      project: s.application.project,
      role: s.application.role,
      scheduledFor: s.scheduledFor?.toISOString() ?? null,
      canJoin:
        s.status === InterviewStatus.LIVE ||
        (s.status === InterviewStatus.SCHEDULED && canJoin(s.scheduledFor, new Date())),
      turns: answered.map((q) => this.toTurn(q, q.response!.answer)),
      current: current ? this.toTurn(current, null) : null,
      closingRemark: s.closingRemark,
      startedAt: s.startedAt?.toISOString() ?? null,
      submittedAt: s.submittedAt?.toISOString() ?? null,
      evaluation: e
        ? {
            technicalScore: e.technicalScore,
            problemSolvingScore: e.problemSolvingScore,
            communicationScore: e.communicationScore,
            projectFitScore: e.projectFitScore,
            overallScore: e.overallScore,
            recommendedRole: e.recommendedRole,
            strengths: e.strengths,
            areasToImprove: e.areasToImprove,
            summary: e.summary,
            createdAt: e.createdAt.toISOString(),
          }
        : null,
      integrity: admin
        ? {
            focusLost: s.focusLost,
            avgThinkSec: thinks.length ? Math.round(thinks.reduce((a, b) => a + b, 0) / thinks.length / 1000) : null,
            answers: answered.length,
          }
        : null,
    };
  }

  // ───────── helpers ─────────

  private async owned(user: AuthUser, sessionId: string) {
    const s = await this.prisma.interviewSession.findUnique({
      where: { id: sessionId },
      select: { id: true, status: true, scheduledFor: true, application: { select: { id: true, userId: true } } },
    });
    if (!s || s.application.userId !== user.id) throw notFound('Interview');
    return s;
  }

  private async enqueue(name: string, data: InterviewJob, suffix: string) {
    // Deterministic job ids make double-submits collapse into one job.
    await this.queue.add(name, data, { jobId: `${name}-${suffix}` });
  }

  private async notify(applicationId: string, subject: string, text: string, path?: string) {
    try {
      const a = await this.prisma.projectApplication.findUniqueOrThrow({
        where: { id: applicationId },
        select: { user: { select: { email: true } } },
      });
      await this.mailer.send({
        to: a.user.email,
        subject: `StudywidBuddy: ${subject}`,
        text: `${text}\n\n${this.env.WEB_ORIGIN[0]}${path ?? `/applications/${applicationId}`}\n`,
      });
    } catch (e) {
      this.logger.warn(`Could not send "${subject}" email: ${(e as Error).message}`);
    }
  }

  private async context(
    applicationId: string,
  ): Promise<{ context: InterviewContext; userId: string; roleIdsByKey: Map<string, string> }> {
    const app = await this.prisma.projectApplication.findUniqueOrThrow({
      where: { id: applicationId },
      include: {
        project: { include: { roles: { select: { id: true, key: true, title: true } } } },
        role: { include: { requiredSkills: { include: { skill: { select: { name: true } } } } } },
        screening: { select: { candidateSummary: true } },
        user: {
          select: {
            profile: { select: { headline: true } },
            skills: { include: { skill: { select: { name: true } } } },
          },
        },
      },
    });
    const skills = new Map<string, { name: string; level: string; proven: boolean }>();
    for (const s of app.user.skills) {
      const prev = skills.get(s.skillId);
      skills.set(s.skillId, {
        name: s.skill.name,
        level: prev && prev.proven && s.source === 'CLAIMED' ? prev.level : s.level.toLowerCase(),
        proven: !!prev?.proven || s.source === 'DEMONSTRATED',
      });
    }
    return {
      userId: app.userId,
      roleIdsByKey: new Map(app.project.roles.map((r) => [r.key, r.id])),
      context: {
        project: {
          title: app.project.title,
          category: app.project.category,
          problem: app.project.problem,
          description: app.project.description,
          difficulty: app.project.difficulty.toLowerCase(),
        },
        role: {
          key: app.role.key,
          title: app.role.title,
          description: app.role.description,
          requiredSkills: app.role.requiredSkills.map((r) => ({
            name: r.skill.name,
            minLevel: r.minLevel.toLowerCase(),
          })),
        },
        otherRoles: app.project.roles.filter((r) => r.id !== app.roleId).map((r) => ({ key: r.key, title: r.title })),
        candidate: {
          headline: app.user.profile?.headline ?? null,
          skills: [...skills.values()],
          motivation: app.motivation,
          relevantExperience: app.relevantExperience,
          hoursPerWeek: app.availabilityHoursPerWeek,
          cvSummary: app.screening?.candidateSummary ?? null,
        },
      },
    };
  }
}
