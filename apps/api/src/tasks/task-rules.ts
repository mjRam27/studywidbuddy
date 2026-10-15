import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@studywidbuddy/shared';
import { DomainError } from '../common/errors/domain-error';

export type TaskStatus = 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

/**
 * Board state machine. Work flows forward one step at a time; it may step back (a review
 * sends work back, a done task can be reopened), but it can't skip review.
 */
export const TASK_TRANSITIONS: Record<TaskStatus, readonly TaskStatus[]> = {
  BACKLOG: ['TODO', 'IN_PROGRESS'],
  TODO: ['BACKLOG', 'IN_PROGRESS'],
  IN_PROGRESS: ['TODO', 'BACKLOG', 'REVIEW'],
  REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: ['IN_PROGRESS'],
};

export function allowedMoves(from: TaskStatus, unfinishedDependencies: number): TaskStatus[] {
  return TASK_TRANSITIONS[from].filter((to) => to !== 'DONE' || unfinishedDependencies === 0);
}

export function assertTaskMove(from: TaskStatus, to: TaskStatus, unfinishedDependencies: { key: string }[]): void {
  if (from === to) return;
  if (!TASK_TRANSITIONS[from].includes(to)) {
    throw new DomainError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `A task can’t move from ${label(from)} to ${label(to)}.`,
      HttpStatus.CONFLICT,
      { from, to, allowed: TASK_TRANSITIONS[from] },
    );
  }
  if (to === 'DONE' && unfinishedDependencies.length) {
    throw new DomainError(
      ErrorCode.TASK_BLOCKED,
      `Finish ${unfinishedDependencies.map((d) => d.key).join(', ')} first: this task depends on ${unfinishedDependencies.length === 1 ? 'it' : 'them'}.`,
      HttpStatus.CONFLICT,
      { blockedBy: unfinishedDependencies.map((d) => d.key) },
    );
  }
}

const label = (s: TaskStatus) => s.toLowerCase().replace('_', ' ');

/**
 * Would adding edges (taskId → each of dependsOn) create a cycle in the graph described by
 * `edges` (task → its prerequisites)? Returns the offending path when it would.
 */
export function findCycle(edges: Map<string, string[]>, taskId: string, dependsOn: string[]): string[] | null {
  for (const start of dependsOn) {
    if (start === taskId) return [taskId, taskId];
    const stack: { node: string; path: string[] }[] = [{ node: start, path: [taskId, start] }];
    const seen = new Set<string>();
    while (stack.length) {
      const { node, path } = stack.pop()!;
      if (node === taskId) return path;
      if (seen.has(node)) continue;
      seen.add(node);
      for (const next of edges.get(node) ?? []) stack.push({ node: next, path: [...path, next] });
    }
  }
  return null;
}

/** Fractional index between neighbours, so a move updates one row. */
export function positionBetween(before: number | null, after: number | null): number {
  if (before === null && after === null) return 1024;
  if (before === null) return after! - 1024;
  if (after === null) return before + 1024;
  return (before + after) / 2;
}

export const FIBONACCI_POINTS = [1, 2, 3, 5, 8, 13] as const;
export const isStoryPoints = (n: number) => (FIBONACCI_POINTS as readonly number[]).includes(n);

/**
 * A task with linked code can only be done when its pull request's checks pass: the team's
 * CI now, plus the platform's acceptance tests once the sandbox runs them. Returns why not,
 * or null. Tasks without a pull request (design, docs) aren't gated.
 */
export function checksGate(
  prs: { number: number; state: 'OPEN' | 'CLOSED' | 'MERGED'; checks: 'NONE' | 'PENDING' | 'SUCCESS' | 'FAILURE' }[],
): string | null {
  const live = prs.filter((p) => p.state !== 'CLOSED');
  const failing = live.find((p) => p.checks === 'FAILURE');
  if (failing) return `Checks are failing on PR #${failing.number}. Fix them before marking this done.`;
  const pending = live.find((p) => p.checks === 'PENDING');
  if (pending) return `Checks are still running on PR #${pending.number}. Wait for them to pass.`;
  return null;
}
