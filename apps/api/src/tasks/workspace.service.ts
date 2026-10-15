import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, SprintStatus, TaskStatus, TeamMemberStatus } from '@prisma/client';
import { ErrorCode, TASK_STATUSES } from '@studywidbuddy/shared';
import type { SprintView, WorkspaceOverview } from '@studywidbuddy/shared';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { taskKey, toTaskCard } from './tasks.service';
import type { CreateSprintDto } from './dto';
import { WorkspaceAccess } from './workspace-access.service';

const DAY = 86_400_000;

/** Pure: remaining points at the end of each sprint day; null for days that haven't happened. */
export function burndown(
  sprint: { startsAt: Date; endsAt: Date },
  tasks: { estimate: number; completedAt: Date | null }[],
  now: Date,
): { date: string; remaining: number | null }[] {
  const total = tasks.reduce((n, t) => n + t.estimate, 0);
  const days: { date: string; remaining: number | null }[] = [];
  const start = Date.UTC(sprint.startsAt.getUTCFullYear(), sprint.startsAt.getUTCMonth(), sprint.startsAt.getUTCDate());
  for (let d = start; d <= sprint.endsAt.getTime(); d += DAY) {
    const endOfDay = d + DAY - 1;
    const remaining =
      d > now.getTime()
        ? null
        : total -
          tasks.filter((t) => t.completedAt && t.completedAt.getTime() <= endOfDay).reduce((n, t) => n + t.estimate, 0);
    days.push({ date: new Date(d).toISOString().slice(0, 10), remaining });
  }
  return days;
}

/**
 * Pure: compares remaining work with an even pace. Within 10% of pace is on track, within
 * 35% at risk, beyond that off track. Blocked or overdue work also pulls health down.
 */
export function sprintHealth(input: {
  total: number;
  remaining: number;
  elapsed: number;
  blocked: number;
  overdue: number;
  daysLeft: number;
}): { health: WorkspaceOverview['health']; reasons: string[] } {
  const onPace = Math.round(input.total * (1 - Math.min(Math.max(input.elapsed, 0), 1)));
  const reasons = [
    `${input.remaining} of ${input.total} pts left with ${input.daysLeft} day${input.daysLeft === 1 ? '' : 's'} to go (on pace would be ${onPace}).`,
  ];
  let level = input.remaining <= onPace * 1.1 + 1 ? 0 : input.remaining <= onPace * 1.35 + 2 ? 1 : 2;
  if (input.blocked) {
    reasons.push(`${input.blocked} task${input.blocked === 1 ? ' is' : 's are'} blocked by unfinished dependencies.`);
    level = Math.max(level, 1);
  }
  if (input.overdue) {
    reasons.push(`${input.overdue} task${input.overdue === 1 ? ' is' : 's are'} past due.`);
    level = Math.max(level, 1);
  }
  return { health: (['ON_TRACK', 'AT_RISK', 'OFF_TRACK'] as const)[level], reasons };
}

@Injectable()
export class WorkspaceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
  ) {}

  async overview(user: AuthUser, slug: string, now = new Date()): Promise<WorkspaceOverview> {
    const ctx = await this.access.bySlug(user, slug);
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      include: {
        milestones: { orderBy: { position: 'asc' } },
        sprints: {
          orderBy: { number: 'asc' },
          include: { tasks: { select: { estimate: true, status: true, completedAt: true } } },
        },
        team: {
          include: {
            members: {
              where: { status: TeamMemberStatus.ACTIVE },
              orderBy: { invitedAt: 'asc' },
              include: {
                role: { select: { id: true, title: true } },
                user: { select: { ...personSelect, skills: { include: { skill: { select: { name: true } } } } } },
              },
            },
          },
        },
      },
    });
    const tasks = await this.prisma.task.findMany({
      where: { projectId: ctx.projectId },
      include: {
        role: { select: { id: true, title: true } },
        assignee: { select: personSelect },
        dependsOn: { include: { dependsOn: { select: { id: true, number: true, status: true } } } },
      },
    });
    const cards = tasks.map((t) => toTaskCard(t, now));

    const sprints: SprintView[] = project.sprints.map((s) => ({
      id: s.id,
      number: s.number,
      goal: s.goal,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      points: {
        total: s.tasks.reduce((n, t) => n + t.estimate, 0),
        done: s.tasks.filter((t) => t.status === 'DONE').reduce((n, t) => n + t.estimate, 0),
      },
    }));
    const active = project.sprints.find((s) => s.status === SprintStatus.ACTIVE) ?? null;

    const counts = Object.fromEntries(TASK_STATUSES.map((s) => [s, 0])) as Record<TaskStatus, number>;
    for (const t of tasks) counts[t.status]++;
    const blocked = cards.filter((c) => c.status !== 'DONE' && c.blockedBy.length);
    const overdue = cards.filter((c) => c.overdue);

    let health: WorkspaceOverview['health'] = 'NOT_STARTED';
    let healthReasons = ['No sprint is running yet.'];
    if (active) {
      const total = active.tasks.reduce((n, t) => n + t.estimate, 0);
      const remaining = active.tasks.filter((t) => t.status !== 'DONE').reduce((n, t) => n + t.estimate, 0);
      const span = active.endsAt.getTime() - active.startsAt.getTime();
      const h = sprintHealth({
        total,
        remaining,
        elapsed: (now.getTime() - active.startsAt.getTime()) / span,
        blocked: blocked.length,
        overdue: overdue.length,
        daysLeft: Math.max(0, Math.ceil((active.endsAt.getTime() - now.getTime()) / DAY)),
      });
      health = h.health;
      healthReasons = h.reasons;
    }

    return {
      project: {
        id: project.id,
        slug: project.slug,
        title: project.title,
        category: project.category,
        status: project.status,
      },
      you: { memberId: ctx.memberId, isAdmin: ctx.isAdmin },
      activeSprint: active ? sprints.find((s) => s.id === active.id)! : null,
      sprints,
      milestones: project.milestones.map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        dueDate: m.dueDate?.toISOString() ?? null,
        completedAt: m.completedAt?.toISOString() ?? null,
      })),
      members: (project.team?.members ?? []).map((m) => {
        const mine = tasks.filter((t) => t.assigneeId === m.userId && t.status !== 'DONE');
        const current = mine.find((t) => t.status === 'IN_PROGRESS') ?? mine.find((t) => t.status === 'REVIEW') ?? null;
        return {
          memberId: m.id,
          user: toPerson(m.user),
          role: m.role,
          skills: [...new Set(m.user.skills.map((s) => s.skill.name))].slice(0, 4),
          openPoints: mine.reduce((n, t) => n + t.estimate, 0),
          current: current
            ? {
                id: current.id,
                key: taskKey(current.number),
                title: current.title,
                status: current.status,
                assignee: toPerson(m.user),
              }
            : null,
        };
      }),
      burndown: active ? burndown(active, active.tasks, now) : [],
      counts,
      blocked,
      overdue,
      health,
      healthReasons,
    };
  }

  // ───────── Sprints ─────────

  async createSprint(user: AuthUser, slug: string, dto: CreateSprintDto): Promise<SprintView> {
    const ctx = await this.access.bySlug(user, slug);
    const startsAt = new Date(dto.startsAt);
    const endsAt = new Date(dto.endsAt);
    if (endsAt <= startsAt)
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'A sprint must end after it starts.', HttpStatus.BAD_REQUEST);
    const sprint = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${ctx.projectId}::uuid FOR UPDATE`;
      const last = await tx.sprint.findFirst({
        where: { projectId: ctx.projectId },
        orderBy: { number: 'desc' },
        select: { number: true },
      });
      const s = await tx.sprint.create({
        data: { projectId: ctx.projectId, number: (last?.number ?? 0) + 1, goal: dto.goal, startsAt, endsAt },
      });
      await this.activity.record(
        {
          projectId: ctx.projectId,
          type: 'SPRINT_CREATED',
          actorUserId: user.id,
          summary: `planned Sprint ${s.number}: ${s.goal}`,
        },
        tx,
      );
      return s;
    });
    return this.sprintView(sprint.id);
  }

  async startSprint(user: AuthUser, sprintId: string): Promise<SprintView> {
    const s = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!s) throw notFound('Sprint');
    await this.access.byId(user, s.projectId);
    try {
      const updated = await this.prisma.sprint.updateMany({
        where: { id: sprintId, status: SprintStatus.PLANNED },
        data: { status: SprintStatus.ACTIVE },
      });
      if (updated.count !== 1)
        throw new DomainError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          'Only a planned sprint can start.',
          HttpStatus.CONFLICT,
        );
    } catch (e) {
      // Partial unique index: one active sprint per project.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          'Finish the current sprint before starting another.',
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
    await this.activity.record({
      projectId: s.projectId,
      type: 'SPRINT_STARTED',
      actorUserId: user.id,
      summary: `started Sprint ${s.number}`,
    });
    return this.sprintView(sprintId);
  }

  /** Completes the sprint; unfinished tasks roll into the next planned sprint (or the backlog). */
  async completeSprint(user: AuthUser, sprintId: string): Promise<SprintView> {
    const s = await this.prisma.sprint.findUnique({ where: { id: sprintId } });
    if (!s) throw notFound('Sprint');
    await this.access.byId(user, s.projectId);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.sprint.updateMany({
        where: { id: sprintId, status: SprintStatus.ACTIVE },
        data: { status: SprintStatus.COMPLETED, completedAt: new Date() },
      });
      if (done.count !== 1)
        throw new DomainError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          'Only the active sprint can be completed.',
          HttpStatus.CONFLICT,
        );
      const next = await tx.sprint.findFirst({
        where: { projectId: s.projectId, status: SprintStatus.PLANNED, number: { gt: s.number } },
        orderBy: { number: 'asc' },
      });
      const carried = await tx.task.updateMany({
        where: { sprintId, status: { not: 'DONE' } },
        data: { sprintId: next?.id ?? null },
      });
      await this.activity.record(
        {
          projectId: s.projectId,
          type: 'SPRINT_COMPLETED',
          actorUserId: user.id,
          summary: `completed Sprint ${s.number}${carried.count ? `; ${carried.count} unfinished task${carried.count === 1 ? '' : 's'} moved to ${next ? `Sprint ${next.number}` : 'the backlog'}` : ''}`,
        },
        tx,
      );
    });
    return this.sprintView(sprintId);
  }

  private async sprintView(id: string): Promise<SprintView> {
    const s = await this.prisma.sprint.findUniqueOrThrow({
      where: { id },
      include: { tasks: { select: { estimate: true, status: true } } },
    });
    return {
      id: s.id,
      number: s.number,
      goal: s.goal,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      status: s.status,
      points: {
        total: s.tasks.reduce((n, t) => n + t.estimate, 0),
        done: s.tasks.filter((t) => t.status === 'DONE').reduce((n, t) => n + t.estimate, 0),
      },
    };
  }
}
