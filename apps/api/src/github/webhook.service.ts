import { createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { type ChecksStatus, Prisma, type PullRequestState, type TaskStatus } from '@prisma/client';
import { TASK_REF_PATTERN } from '@studywidbuddy/shared';
import { ActivityService } from '../activity/activity.service';
import { ChatService } from '../chat/chat.service';
import { ENV, type Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { checksGate, positionBetween, TASK_TRANSITIONS } from '../tasks/task-rules';
import { taskKey } from '../tasks/tasks.service';
import { GITHUB_UPDATED } from './github.service';

/** Verifies X-Hub-Signature-256 against the exact raw body GitHub sent. */
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = Buffer.from(`sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`);
  const given = Buffer.from(header);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** The task a PR implements: "TASK-24" in the title first, then in the branch name. */
export function taskNumberFrom(title: string, branch: string): number | null {
  const m = TASK_REF_PATTERN.exec(title) ?? TASK_REF_PATTERN.exec(branch);
  return m ? Number(m[1]) : null;
}

/** GitHub check conclusions → our status. Neutral/skipped runs don't change anything. */
export function checksFrom(status: string | null, conclusion: string | null): ChecksStatus | null {
  if (status && status !== 'completed') return 'PENDING';
  switch (conclusion) {
    case 'success':
      return 'SUCCESS';
    case 'failure':
    case 'timed_out':
    case 'cancelled':
    case 'action_required':
    case 'startup_failure':
      return 'FAILURE';
    default:
      return null;
  }
}

interface PrPayload {
  number: number;
  title: string;
  state: 'open' | 'closed';
  draft?: boolean;
  merged?: boolean;
  merged_at?: string | null;
  html_url: string;
  user: { login: string };
  head: { ref: string; sha: string };
}

type Payload = {
  action?: string;
  repository?: { id: number };
  sender?: { login: string };
  pull_request?: PrPayload;
  workflow_run?: {
    status: string | null;
    conclusion: string | null;
    head_sha: string;
    pull_requests?: { number: number }[];
  };
  check_suite?: {
    status: string | null;
    conclusion: string | null;
    head_sha: string;
    pull_requests?: { number: number }[];
  };
  ref?: string;
  commits?: unknown[];
  deleted?: boolean;
  pusher?: { name: string };
};

export type DeliveryResult = 'processed' | 'duplicate' | 'ignored';

/**
 * GitHub webhooks. Each delivery is recorded once (GitHub retries); events for repos that
 * aren't platform team repos are ignored. Code events update pull requests, link them to
 * tasks, move tasks along the board and keep CI status in sync.
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly activity: ActivityService,
    private readonly chat: ChatService,
    private readonly realtime: RealtimeGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  verify(rawBody: Buffer | undefined, signature: string | undefined): boolean {
    return (
      !!rawBody &&
      !!this.env.GITHUB_WEBHOOK_SECRET &&
      verifySignature(this.env.GITHUB_WEBHOOK_SECRET, rawBody, signature)
    );
  }

  async handle(deliveryId: string, event: string, payload: Payload): Promise<DeliveryResult> {
    try {
      await this.prisma.githubDelivery.create({
        data: {
          id: deliveryId,
          event,
          action: payload.action ?? null,
          repoId: payload.repository ? BigInt(payload.repository.id) : null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return 'duplicate';
      throw e;
    }
    const repo = payload.repository
      ? await this.prisma.projectRepo.findUnique({ where: { githubRepoId: BigInt(payload.repository.id) } })
      : null;
    if (!repo) {
      await this.done(deliveryId);
      return 'ignored';
    }
    try {
      switch (event) {
        case 'pull_request':
          if (payload.pull_request)
            await this.onPullRequest(repo.projectId, payload.action ?? '', payload.pull_request);
          break;
        case 'workflow_run':
          if (payload.workflow_run) await this.onChecks(repo.projectId, payload.workflow_run);
          break;
        case 'check_suite':
          if (payload.check_suite) await this.onChecks(repo.projectId, payload.check_suite);
          break;
        case 'push':
          await this.onPush(repo.projectId, payload);
          break;
        default:
          break;
      }
      await this.done(deliveryId);
      this.realtime.emitToProject(repo.projectId, GITHUB_UPDATED, { projectId: repo.projectId });
      return 'processed';
    } catch (e) {
      await this.prisma.githubDelivery.update({
        where: { id: deliveryId },
        data: { error: (e as Error).message.slice(0, 500) },
      });
      throw e;
    }
  }

  private done(id: string) {
    return this.prisma.githubDelivery.update({ where: { id }, data: { processedAt: new Date() } });
  }

  // ───────── pull requests ─────────

  private async onPullRequest(projectId: string, action: string, pr: PrPayload) {
    const state: PullRequestState = pr.merged ? 'MERGED' : pr.state === 'closed' ? 'CLOSED' : 'OPEN';
    const n = taskNumberFrom(pr.title, pr.head.ref);
    const task = n
      ? await this.prisma.task.findFirst({
          where: { projectId, number: n },
          select: { id: true, number: true, status: true },
        })
      : null;
    const author = await this.prisma.githubAccount.findFirst({
      where: { login: { equals: pr.user.login, mode: 'insensitive' } },
      select: { userId: true },
    });
    const before = await this.prisma.pullRequest.findUnique({
      where: { projectId_number: { projectId, number: pr.number } },
    });
    const newCommits = action === 'synchronize' || (before && before.headSha !== pr.head.sha);
    await this.prisma.pullRequest.upsert({
      where: { projectId_number: { projectId, number: pr.number } },
      create: {
        projectId,
        number: pr.number,
        title: pr.title,
        state,
        draft: !!pr.draft,
        authorLogin: pr.user.login,
        authorUserId: author?.userId ?? null,
        headBranch: pr.head.ref,
        headSha: pr.head.sha,
        htmlUrl: pr.html_url,
        taskId: task?.id ?? null,
        checks: 'NONE',
      },
      update: {
        title: pr.title,
        state,
        draft: !!pr.draft,
        headBranch: pr.head.ref,
        headSha: pr.head.sha,
        taskId: task?.id ?? null,
        // New commits invalidate earlier results until CI reports again.
        checks: newCommits ? 'PENDING' : undefined,
        mergedAt: pr.merged_at ? new Date(pr.merged_at) : null,
      },
    });

    const key = task ? taskKey(task.number) : null;
    if (task && (!before || before.taskId !== task.id)) {
      await this.prisma.task.update({
        where: { id: task.id },
        data: { pullRequestUrl: pr.html_url, branch: pr.head.ref.slice(0, 120) },
      });
    }

    if (action === 'opened' || (action === 'reopened' && state === 'OPEN')) {
      await this.activity.record({
        projectId,
        type: 'PR_OPENED',
        actorUserId: author?.userId ?? null,
        actorKind: author ? 'USER' : 'SYSTEM',
        taskId: task?.id ?? null,
        summary: `opened PR #${pr.number} “${pr.title}”${key ? ` for ${key}` : ''}`,
      });
      await this.chat.postAsAi(
        projectId,
        `@${pr.user.login} opened PR #${pr.number}: ${pr.title}${key ? ` (${key})` : ' (not linked to a task: start the title with TASK-n)'}`,
        undefined,
        'SYSTEM',
      );
    }
    // A ready (non-draft) PR means the work is up for review.
    if (task && state === 'OPEN' && !pr.draft && task.status === 'IN_PROGRESS') {
      await this.systemMove(projectId, task.id, 'REVIEW', `PR #${pr.number} is ready for review`);
    }
    if (action === 'closed' && state === 'MERGED') {
      await this.activity.record({
        projectId,
        type: 'PR_MERGED',
        actorKind: 'SYSTEM',
        taskId: task?.id ?? null,
        summary: `PR #${pr.number} was merged${key ? ` (${key})` : ''}`,
      });
      if (task) await this.tryComplete(projectId, task.id, pr.number);
    } else if (action === 'closed') {
      await this.activity.record({
        projectId,
        type: 'PR_CLOSED',
        actorKind: 'SYSTEM',
        taskId: task?.id ?? null,
        summary: `PR #${pr.number} was closed without merging`,
      });
    }
  }

  // ───────── CI ─────────

  private async onChecks(
    projectId: string,
    run: { status: string | null; conclusion: string | null; head_sha: string; pull_requests?: { number: number }[] },
  ) {
    const checks = checksFrom(run.status, run.conclusion);
    if (!checks) return;
    // Only results for a PR's current head commit count; stale runs are ignored.
    const prs = await this.prisma.pullRequest.findMany({
      where: {
        projectId,
        headSha: run.head_sha,
        ...(run.pull_requests?.length ? { number: { in: run.pull_requests.map((p) => p.number) } } : {}),
      },
    });
    for (const pr of prs) {
      if (pr.checks === checks) continue;
      await this.prisma.pullRequest.update({ where: { id: pr.id }, data: { checks } });
      if (checks === 'PENDING') continue;
      await this.activity.record({
        projectId,
        type: checks === 'SUCCESS' ? 'CHECKS_PASSED' : 'CHECKS_FAILED',
        actorKind: 'SYSTEM',
        taskId: pr.taskId,
        summary: `CI ${checks === 'SUCCESS' ? 'passed' : 'failed'} on PR #${pr.number}`,
      });
      // Merged before CI finished: complete the task once it passes.
      if (checks === 'SUCCESS' && pr.state === 'MERGED' && pr.taskId)
        await this.tryComplete(projectId, pr.taskId, pr.number);
    }
  }

  private async onPush(projectId: string, p: Payload) {
    const commits = p.commits?.length ?? 0;
    if (p.deleted || !commits || !p.ref?.startsWith('refs/heads/')) return;
    const branch = p.ref.slice('refs/heads/'.length);
    const who = p.sender?.login ?? p.pusher?.name ?? 'someone';
    const author = await this.prisma.githubAccount.findFirst({
      where: { login: { equals: who, mode: 'insensitive' } },
      select: { userId: true },
    });
    await this.activity.record({
      projectId,
      type: 'CODE_PUSHED',
      actorUserId: author?.userId ?? null,
      actorKind: author ? 'USER' : 'SYSTEM',
      summary: `pushed ${commits} commit${commits === 1 ? '' : 's'} to ${branch}${author ? '' : ` (@${who})`}`,
    });
  }

  // ───────── task moves ─────────

  /** Merged and green: the task is done. Otherwise it waits in review with a note. */
  private async tryComplete(projectId: string, taskId: string, prNumber: number) {
    const t = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        dependsOn: { include: { dependsOn: { select: { status: true } } } },
        pullRequests: { select: { number: true, state: true, checks: true } },
      },
    });
    if (t.status === 'DONE') return;
    const why =
      checksGate(t.pullRequests) ??
      (t.pullRequests.some((p) => p.number === prNumber && p.checks !== 'SUCCESS')
        ? `CI hasn’t passed on PR #${prNumber} yet.`
        : null) ??
      (t.dependsOn.some((d) => d.dependsOn.status !== 'DONE') ? 'It still has unfinished dependencies.' : null);
    if (why) {
      await this.activity.record({
        projectId,
        type: 'TASK_UPDATED',
        actorKind: 'SYSTEM',
        taskId,
        summary: `${taskKey(t.number)} wasn’t completed automatically: ${why}`,
      });
      return;
    }
    if (t.status !== 'REVIEW' && t.status !== 'IN_PROGRESS') return;
    if (t.status === 'IN_PROGRESS') await this.systemMove(projectId, taskId, 'REVIEW', `PR #${prNumber} merged`);
    await this.systemMove(projectId, taskId, 'DONE', `PR #${prNumber} merged with passing checks`);
  }

  private async systemMove(projectId: string, taskId: string, to: TaskStatus, reason: string) {
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.findUniqueOrThrow({ where: { id: taskId } });
      if (t.status === to || !TASK_TRANSITIONS[t.status].includes(to)) return;
      const last = await tx.task.findFirst({
        where: { projectId, status: to },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const moved = await tx.task.updateMany({
        where: { id: taskId, status: t.status },
        data: {
          status: to,
          position: positionBetween(last?.position ?? null, null),
          completedAt: to === 'DONE' ? new Date() : undefined,
        },
      });
      if (moved.count !== 1) return;
      await this.activity.record(
        {
          projectId,
          type: 'TASK_STATUS_CHANGED',
          actorKind: 'SYSTEM',
          taskId,
          summary: `moved ${taskKey(t.number)} to ${to.toLowerCase().replace('_', ' ')}: ${reason}`,
          data: { from: t.status, to },
        },
        tx,
      );
    });
    this.logger.debug(`task ${taskId} → ${to} (${reason})`);
  }
}
