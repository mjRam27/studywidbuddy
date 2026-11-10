import { HttpStatus, Injectable } from '@nestjs/common';
import { type DebugAttempt, Prisma } from '@prisma/client';
import {
  DEBUG_LEVELS,
  ErrorCode,
  type DebugAttemptView,
  type DebugExerciseView,
  type DebugListQuery,
  type DebugListResponse,
  type DebugProfileStats,
  type DebugReview,
  type DebugRunRequest,
  type DebugRunResponse,
} from '@studywidbuddy/shared';
import { AiError } from '../ai/ai-provider';
import { GeminiChat } from '../ai/gemini-chat';
import type { AuthUser } from '../common/auth/auth-user';
import { isSuperUser } from '../common/auth/super-user';
import { conflict, DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { assistantPrompt } from './assistant-prompt';
import { filterCatalogue, findExercise, learnerFiles, median, progressOf, revealBugs, toSummary } from './catalogue';
import type { DebugAssistantDto } from './dto';
import type { ExerciseDef } from './exercise';

/** Assistant messages per learner per day (the coach runs on Gemini; admins are exempt). */
export const DAILY_ASSISTANT_LIMIT = 150;
const ASSISTANT_PURPOSE = 'debug.assistant';
const RECENT_SOLVES = 5;

type Files = { path: string; content: string }[];

/**
 * Debug exercises: the catalogue (in code) plus each learner's attempts. Tests run in the
 * learner's browser; the API records runs and the first passing run, which reveals the
 * review. It never executes learner code.
 */
@Injectable()
export class DebugService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiChat,
  ) {}

  async list(userId: string, query: DebugListQuery): Promise<DebugListResponse> {
    const attempts = await this.prisma.debugAttempt.findMany({
      where: { userId },
      select: { exerciseSlug: true, solvedAt: true },
    });
    const status = new Map(attempts.map((a) => [a.exerciseSlug, a.solvedAt ? 'SOLVED' : 'IN_PROGRESS'] as const));
    return {
      items: filterCatalogue(query, (slug) => status.get(slug) ?? 'NEW'),
      progress: progressOf(new Set(attempts.filter((a) => a.solvedAt).map((a) => a.exerciseSlug))),
    };
  }

  async view(userId: string, slug: string): Promise<DebugExerciseView> {
    const ex = this.exercise(slug);
    const attempt = await this.find(userId, slug);
    const { status: _status, ...summary } = toSummary(ex, 'NEW');
    return { ...summary, brief: ex.brief, files: learnerFiles(ex), attempt: attempt ? toAttemptView(attempt) : null };
  }

  /** Opening an exercise starts the clock (once). */
  async start(userId: string, slug: string): Promise<DebugAttemptView> {
    this.exercise(slug);
    return toAttemptView(await this.ensureAttempt(userId, slug));
  }

  /** Records a test run. The first run with every test passing solves the exercise. */
  async run(userId: string, slug: string, dto: DebugRunRequest): Promise<DebugRunResponse> {
    const ex = this.exercise(slug);
    const attempt = await this.ensureAttempt(userId, slug);
    const passing = dto.failed === 0 && dto.passed > 0;
    if (passing && !attempt.solvedAt) {
      const now = new Date();
      // Guarded on solvedAt so two racing runs can't both "solve" it.
      await this.prisma.debugAttempt.updateMany({
        where: { id: attempt.id, solvedAt: null },
        data: {
          runs: { increment: 1 },
          solvedAt: now,
          durationSec: Math.max(1, Math.round((now.getTime() - attempt.startedAt.getTime()) / 1000)),
          solvedFiles: sourceFiles(ex, dto.files) as unknown as Prisma.InputJsonValue,
        },
      });
    } else {
      await this.prisma.debugAttempt.update({ where: { id: attempt.id }, data: { runs: { increment: 1 } } });
    }
    const updated = await this.prisma.debugAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    return { attempt: toAttemptView(updated), review: updated.solvedAt ? reviewOf(ex, updated) : null };
  }

  async review(userId: string, slug: string): Promise<DebugReview> {
    const ex = this.exercise(slug);
    const attempt = await this.find(userId, slug);
    if (!attempt?.solvedAt) throw conflict(ErrorCode.CONFLICT, 'Solve the exercise first to see the review.');
    return reviewOf(ex, attempt);
  }

  /** The Debug coach (Gemini). Explains and guides; gives fixes only with the solution toggle on. */
  async assistant(user: AuthUser, slug: string, dto: DebugAssistantDto): Promise<string> {
    const ex = this.exercise(slug);
    if (!this.gemini.configured) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'The Debug assistant isn’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!isSuperUser(user)) {
      const today = await this.prisma.aiCall.count({
        where: { userId: user.id, purpose: ASSISTANT_PURPOSE, createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      });
      if (today >= DAILY_ASSISTANT_LIMIT) {
        throw new DomainError(
          ErrorCode.RATE_LIMITED,
          `You’ve used today’s ${DAILY_ASSISTANT_LIMIT} assistant messages. They refill over the next 24 hours.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
    }
    const attempt = await this.ensureAttempt(user.id, slug);
    await this.prisma.debugAttempt.update({
      where: { id: attempt.id },
      data: {
        assistantTurns: { increment: 1 },
        // Only counts as "used the solution" before the exercise was solved.
        ...(dto.solution && !attempt.solvedAt ? { solutionViewed: true } : {}),
      },
    });
    const prompt = assistantPrompt(ex, dto);
    try {
      return await this.gemini.reply({
        purpose: ASSISTANT_PURPOSE,
        userId: user.id,
        system: prompt.system,
        turns: prompt.turns,
        maxTokens: 1500,
      });
    } catch (e) {
      if (!(e instanceof AiError)) throw e;
      throw new DomainError(
        ErrorCode.AI_UNAVAILABLE,
        'The assistant couldn’t answer just now. Try again in a moment.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** The Debugging card on a profile. */
  async profileStats(userId: string): Promise<DebugProfileStats> {
    const solved = await this.prisma.debugAttempt.findMany({
      where: { userId, solvedAt: { not: null } },
      orderBy: { solvedAt: 'desc' },
      select: { exerciseSlug: true, solvedAt: true, durationSec: true },
    });
    const known = solved.filter((a) => findExercise(a.exerciseSlug));
    const byLevel = Object.fromEntries(DEBUG_LEVELS.map((l) => [l, 0])) as DebugProfileStats['byLevel'];
    for (const a of known) byLevel[findExercise(a.exerciseSlug)!.level]++;
    return {
      solved: known.length,
      byLevel,
      medianSolveSec: median(known.map((a) => a.durationSec).filter((d): d is number => d !== null)),
      recent: known.slice(0, RECENT_SOLVES).map((a) => {
        const ex = findExercise(a.exerciseSlug)!;
        return {
          slug: ex.slug,
          title: ex.title,
          level: ex.level,
          solvedAt: a.solvedAt!.toISOString(),
          durationSec: a.durationSec,
        };
      }),
    };
  }

  // ───────── helpers ─────────

  private exercise(slug: string): ExerciseDef {
    const ex = findExercise(slug);
    if (!ex) throw notFound('Exercise');
    return ex;
  }

  private find(userId: string, slug: string) {
    return this.prisma.debugAttempt.findUnique({ where: { userId_exerciseSlug: { userId, exerciseSlug: slug } } });
  }

  private ensureAttempt(userId: string, slug: string) {
    return this.prisma.debugAttempt.upsert({
      where: { userId_exerciseSlug: { userId, exerciseSlug: slug } },
      create: { userId, exerciseSlug: slug },
      update: {},
    });
  }
}

function toAttemptView(a: DebugAttempt): DebugAttemptView {
  return {
    status: a.solvedAt ? 'SOLVED' : 'IN_PROGRESS',
    startedAt: a.startedAt.toISOString(),
    solvedAt: a.solvedAt?.toISOString() ?? null,
    durationSec: a.durationSec,
    runs: a.runs,
    solutionViewed: a.solutionViewed,
  };
}

/** Only the exercise's own source files are kept (never the read-only tests or stray paths). */
function sourceFiles(ex: ExerciseDef, files: Files): Files {
  return files.filter((f) => f.path in ex.files).map((f) => ({ path: f.path, content: f.content }));
}

function reviewOf(ex: ExerciseDef, a: DebugAttempt): DebugReview {
  return {
    attempt: toAttemptView(a),
    bugs: revealBugs(ex),
    yourFiles: Array.isArray(a.solvedFiles) ? (a.solvedFiles as unknown as Files) : [],
  };
}
