import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { CodeReviewStatus, Prisma, type CodeReview } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { CodeReviewView, ReviewFinding } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { ActivityService } from '../../activity/activity.service';
import { AiError, AiProvider } from '../../ai/ai-provider';
import { ChatService } from '../../chat/chat.service';
import type { AuthUser } from '../../common/auth/auth-user';
import { DomainError, notFound } from '../../common/errors/domain-error';
import { PrismaService } from '../../common/prisma/prisma.service';
import { REVIEW_QUEUE } from '../../queue/queue.module';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { taskKey } from '../../tasks/tasks.service';
import { WorkspaceAccess } from '../../tasks/workspace-access.service';
import { GithubApiError, GithubClient } from '../github-client';
import { commentBody, reviewBody } from './review-ai';
import { buildReviewGraph } from './review-graph';

export const JOB_REVIEW = 'pr.review';
export interface ReviewJob {
  reviewId: string;
}

/** Same event name as GithubService.GITHUB_UPDATED (kept local to avoid an import cycle). */
const GITHUB_UPDATED = 'github:updated';
const NOTHING_TO_REVIEW = 'Nothing to review: only lockfiles, generated code, binaries or deletions changed.';
const STALE = 'A newer commit was pushed; that commit is reviewed instead.';

/**
 * AI code review of pull requests. One review per PR head commit (unique in the database):
 * the webhook asks for one when a ready PR opens or gets new commits, team members can
 * re-run it. A worker fetches the diff, runs the LangGraph pipeline (review-graph.ts) and
 * posts one COMMENT review on GitHub with inline findings. Findings are stored before posting
 * and the GitHub review id after, so a retried job never re-runs the model or posts twice.
 */
@Injectable()
export class ReviewService {
  private readonly logger = new Logger(ReviewService.name);
  private readonly graph: ReturnType<typeof buildReviewGraph>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly client: GithubClient,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
    private readonly chat: ChatService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(REVIEW_QUEUE) private readonly queue: Queue<ReviewJob>,
  ) {
    this.graph = buildReviewGraph(ai);
  }

  /**
   * Queues a review of the PR's current head commit, once per commit. Drafts and closed PRs
   * are not reviewed unless `force` (a person asked). Returns the review id, or null.
   */
  async request(pullRequestId: string, force = false): Promise<string | null> {
    if (!this.ai.isConfigured()) return null;
    const pr = await this.prisma.pullRequest.findUnique({
      where: { id: pullRequestId },
      select: { headSha: true, state: true, draft: true },
    });
    if (!pr || pr.state !== 'OPEN' || (pr.draft && !force)) return null;
    const key = { pullRequestId_headSha: { pullRequestId, headSha: pr.headSha } };
    const existing = await this.prisma.codeReview.findUnique({ where: key });
    if (existing) {
      const busy = existing.status === CodeReviewStatus.QUEUED || existing.status === CodeReviewStatus.RUNNING;
      if (!force || busy) return existing.id;
      await this.prisma.codeReview.update({ where: { id: existing.id }, data: this.reset() });
      await this.enqueue(existing.id, `rerun-${Date.now()}`);
      return existing.id;
    }
    try {
      const created = await this.prisma.codeReview.create({
        data: { pullRequestId, headSha: pr.headSha },
        select: { id: true },
      });
      await this.enqueue(created.id, 'initial');
      return created.id;
    } catch (e) {
      // Two deliveries for the same commit: the other one queued it.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return (await this.prisma.codeReview.findUnique({ where: key, select: { id: true } }))?.id ?? null;
      }
      throw e;
    }
  }

  /** A team member (or admin) asks for a fresh review of the PR's current commit. */
  async rerun(user: AuthUser, slug: string, number: number): Promise<CodeReviewView> {
    const ctx = await this.access.bySlug(user, slug);
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'AI review isn’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const pr = await this.prisma.pullRequest.findUnique({
      where: { projectId_number: { projectId: ctx.projectId, number } },
      select: { id: true, state: true },
    });
    if (!pr) throw notFound('Pull request');
    if (pr.state !== 'OPEN') {
      throw new DomainError(ErrorCode.CONFLICT, 'Only open pull requests can be reviewed.', HttpStatus.CONFLICT);
    }
    const id = await this.request(pr.id, true);
    return this.toView(await this.prisma.codeReview.findUniqueOrThrow({ where: { id: id! } }));
  }

  // ───────── worker ─────────

  async run(reviewId: string): Promise<void> {
    const claimed = await this.prisma.codeReview.updateMany({
      where: { id: reviewId, status: { in: [CodeReviewStatus.QUEUED, CodeReviewStatus.RUNNING] } },
      data: { status: CodeReviewStatus.RUNNING },
    });
    if (claimed.count !== 1) return; // finished, skipped or failed meanwhile
    const row = await this.prisma.codeReview.findUniqueOrThrow({
      where: { id: reviewId },
      include: {
        pullRequest: {
          include: {
            task: { select: { number: true, title: true, description: true, acceptanceCriteria: true } },
            project: { select: { id: true, title: true, difficulty: true, repo: { select: { name: true } } } },
          },
        },
      },
    });
    const pr = row.pullRequest;
    const repo = pr.project.repo?.name;
    if (!repo || pr.state !== 'OPEN') return this.skip(reviewId, 'The pull request is closed.');
    if (pr.headSha !== row.headSha) return this.skip(reviewId, STALE);

    let stored: CodeReview = row;
    if (!row.verdict) {
      const gh = await this.client.pullRequest(repo, pr.number);
      if (gh.headSha !== row.headSha) return this.skip(reviewId, STALE);
      const files = await this.client.pullRequestFiles(repo, pr.number);
      const out = await this.graph.invoke({
        context: {
          project: { title: pr.project.title, difficulty: pr.project.difficulty },
          pr: { number: pr.number, title: gh.title, body: gh.body, baseRef: gh.baseRef },
          task: pr.task
            ? {
                key: taskKey(pr.task.number),
                title: pr.task.title,
                description: pr.task.description,
                acceptanceCriteria: pr.task.acceptanceCriteria,
              }
            : null,
        },
        files,
        userId: pr.authorUserId ?? undefined,
      });
      const skippedReason = out.skipped.length ? `${out.skipped.length} file(s) skipped` : null;
      if (!out.review.length) {
        await this.prisma.codeReview.update({
          where: { id: reviewId },
          data: {
            status: CodeReviewStatus.SKIPPED,
            skippedReason: NOTHING_TO_REVIEW,
            filesSkipped: out.skipped.length,
          },
        });
        this.realtime.emitToProject(pr.projectId, GITHUB_UPDATED, { projectId: pr.projectId });
        return;
      }
      // Stored before posting: a retry after a failed post doesn't pay for the model again.
      stored = await this.prisma.codeReview.update({
        where: { id: reviewId },
        data: {
          verdict: out.verdict,
          summary: out.summary,
          findings: out.findings as unknown as Prisma.InputJsonValue,
          filesReviewed: out.review.length,
          filesSkipped: out.skipped.length,
          skippedReason,
        },
      });
    }
    if (stored.githubReviewId) return; // already on GitHub

    const findings = (stored.findings ?? []) as unknown as ReviewFinding[];
    const content = {
      verdict: stored.verdict!,
      summary: stored.summary ?? '',
      findings,
      filesReviewed: stored.filesReviewed,
      skipped: [],
    };
    let posted: { id: number; htmlUrl: string };
    try {
      posted = await this.client.createReview(repo, pr.number, {
        commitId: stored.headSha,
        body: reviewBody(content),
        comments: findings.map((f) => ({ path: f.path, line: f.line, body: commentBody(f) })),
      });
    } catch (e) {
      // GitHub refuses the whole review if one line can't be anchored: post them in the body instead.
      if (!(e instanceof GithubApiError) || e.status !== 422 || !findings.length) throw e;
      this.logger.warn(`Inline comments rejected on ${repo}#${pr.number}; posting findings in the review body`);
      posted = await this.client.createReview(repo, pr.number, {
        commitId: stored.headSha,
        body: reviewBody(content, true),
        comments: [],
      });
    }
    await this.prisma.codeReview.update({
      where: { id: reviewId },
      data: {
        status: CodeReviewStatus.POSTED,
        githubReviewId: BigInt(posted.id),
        githubUrl: posted.htmlUrl,
        postedAt: new Date(),
      },
    });
    const majors = findings.filter((f) => f.severity === 'BLOCKER' || f.severity === 'MAJOR').length;
    const verdict =
      stored.verdict === 'LOOKS_GOOD'
        ? 'looks good'
        : `changes suggested (${majors} important finding${majors === 1 ? '' : 's'})`;
    await this.activity.record({
      projectId: pr.projectId,
      type: 'PR_REVIEWED',
      actorKind: 'AGENT',
      taskId: pr.taskId,
      summary: `AI review on PR #${pr.number}: ${verdict}`,
    });
    await this.chat.postAsAi(
      pr.projectId,
      `◆ AI review on PR #${pr.number} “${pr.title}”: ${verdict}. ${findings.length} comment${
        findings.length === 1 ? '' : 's'
      } on GitHub: ${posted.htmlUrl}`,
    );
    this.realtime.emitToProject(pr.projectId, GITHUB_UPDATED, { projectId: pr.projectId });
  }

  async markFailed(reviewId: string, error: unknown) {
    const reason =
      error instanceof AiError ? `${error.kind}: ${error.message}` : String((error as Error)?.message ?? error);
    this.logger.warn(`Code review ${reviewId} failed: ${reason}`);
    const r = await this.prisma.codeReview.findUnique({
      where: { id: reviewId },
      select: { pullRequest: { select: { projectId: true } } },
    });
    await this.prisma.codeReview.updateMany({
      where: { id: reviewId, status: { in: [CodeReviewStatus.QUEUED, CodeReviewStatus.RUNNING] } },
      data: { status: CodeReviewStatus.FAILED, failureReason: reason.slice(0, 500) },
    });
    if (r) this.realtime.emitToProject(r.pullRequest.projectId, GITHUB_UPDATED, { projectId: r.pullRequest.projectId });
  }

  // ───────── views ─────────

  toView(r: CodeReview): CodeReviewView {
    return {
      id: r.id,
      headSha: r.headSha,
      status: r.status,
      verdict: r.verdict,
      summary: r.summary,
      findings: (r.findings ?? []) as unknown as ReviewFinding[],
      filesReviewed: r.filesReviewed,
      filesSkipped: r.filesSkipped,
      skippedReason: r.skippedReason,
      failureReason:
        r.status === CodeReviewStatus.FAILED ? 'The AI review couldn’t finish. You can run it again.' : null,
      githubUrl: r.githubUrl,
      createdAt: r.createdAt.toISOString(),
      postedAt: r.postedAt?.toISOString() ?? null,
    };
  }

  private async skip(reviewId: string, reason: string) {
    await this.prisma.codeReview.update({
      where: { id: reviewId },
      data: { status: CodeReviewStatus.SKIPPED, skippedReason: reason },
    });
  }

  private reset(): Prisma.CodeReviewUpdateInput {
    return {
      status: CodeReviewStatus.QUEUED,
      verdict: null,
      summary: null,
      findings: Prisma.DbNull,
      filesReviewed: 0,
      filesSkipped: 0,
      skippedReason: null,
      failureReason: null,
      githubReviewId: null,
      githubUrl: null,
      postedAt: null,
    };
  }

  private async enqueue(reviewId: string, suffix: string) {
    await this.queue.add(JOB_REVIEW, { reviewId }, { jobId: `${JOB_REVIEW}-${reviewId}-${suffix}` });
  }
}
