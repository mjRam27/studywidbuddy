import { HttpStatus, Injectable } from '@nestjs/common';
import { Prisma, TaskStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { TaskCard, TaskDetail, TaskRef } from '@studywidbuddy/shared';
import { ActivityService, activityInclude, toActivityItem } from '../activity/activity.service';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { allowedMoves, assertTaskMove, checksGate, findCycle, isStoryPoints, positionBetween } from './task-rules';
import type { CreateTaskDto, TaskQueryDto, UpdateTaskDto } from './dto';
import { WorkspaceAccess } from './workspace-access.service';

const cardInclude = {
  role: { select: { id: true, title: true } },
  assignee: { select: personSelect },
  dependsOn: { include: { dependsOn: { select: { id: true, number: true, status: true } } } },
} satisfies Prisma.TaskInclude;
type CardRow = Prisma.TaskGetPayload<{ include: typeof cardInclude }>;

const refSelect = {
  id: true,
  number: true,
  title: true,
  status: true,
  assignee: { select: personSelect },
} satisfies Prisma.TaskSelect;
type RefRow = Prisma.TaskGetPayload<{ select: typeof refSelect }>;

export const taskKey = (n: number) => `TASK-${n}`;
const label = (s: TaskStatus) => s.toLowerCase().replace('_', ' ');

export function toTaskCard(t: CardRow, now = new Date()): TaskCard {
  const blockedBy = t.dependsOn
    .filter((d) => d.dependsOn.status !== 'DONE')
    .map((d) => ({ id: d.dependsOn.id, key: taskKey(d.dependsOn.number) }));
  return {
    id: t.id,
    key: taskKey(t.number),
    number: t.number,
    title: t.title,
    status: t.status,
    priority: t.priority,
    estimate: t.estimate,
    position: t.position,
    role: t.role,
    assignee: t.assignee ? toPerson(t.assignee) : null,
    sprintId: t.sprintId,
    aiSuggested: t.aiSuggested,
    dueDate: t.dueDate?.toISOString() ?? null,
    pullRequestUrl: t.pullRequestUrl,
    blockedBy,
    dependsOnCount: t.dependsOn.length,
    overdue: !!t.dueDate && t.dueDate < now && t.status !== 'DONE',
  };
}

const toRef = (t: RefRow): TaskRef => ({
  id: t.id,
  key: taskKey(t.number),
  title: t.title,
  status: t.status,
  assignee: t.assignee ? toPerson(t.assignee) : null,
});

@Injectable()
export class TasksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
  ) {}

  async list(user: AuthUser, slug: string, q: TaskQueryDto): Promise<TaskCard[]> {
    const ctx = await this.access.bySlug(user, slug);
    const rows = await this.prisma.task.findMany({
      where: {
        projectId: ctx.projectId,
        sprintId: q.sprintId,
        status: q.status,
        priority: q.priority,
        roleId: q.roleId,
        assigneeId: q.mine ? user.id : q.assigneeId,
      },
      orderBy: [{ status: 'asc' }, { position: 'asc' }, { number: 'asc' }],
      include: cardInclude,
    });
    return rows.map((r) => toTaskCard(r));
  }

  async create(user: AuthUser, slug: string, dto: CreateTaskDto): Promise<TaskDetail> {
    const ctx = await this.access.bySlug(user, slug);
    await this.validateRefs(ctx.projectId, dto);
    const status = dto.status ?? 'BACKLOG';
    const id = await this.prisma.$transaction(async (tx) => {
      // Serialise numbering per project so TASK-n is never handed out twice.
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${ctx.projectId}::uuid FOR UPDATE`;
      const [{ max }] = await tx.$queryRaw<
        { max: number | null }[]
      >`SELECT MAX("number") AS max FROM "Task" WHERE "projectId" = ${ctx.projectId}::uuid`;
      const last = await tx.task.findFirst({
        where: { projectId: ctx.projectId, status },
        orderBy: { position: 'desc' },
        select: { position: true },
      });
      const task = await tx.task.create({
        data: {
          projectId: ctx.projectId,
          number: (max ?? 0) + 1,
          title: dto.title,
          description: dto.description ?? '',
          acceptanceCriteria: dto.acceptanceCriteria ?? [],
          priority: dto.priority ?? 'MEDIUM',
          estimate: dto.estimate ?? 1,
          roleId: dto.roleId ?? null,
          assigneeId: dto.assigneeId ?? null,
          sprintId: dto.sprintId ?? null,
          status,
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          position: positionBetween(last?.position ?? null, null),
          createdById: user.id,
        },
      });
      await this.activity.record(
        {
          projectId: ctx.projectId,
          type: 'TASK_CREATED',
          actorUserId: user.id,
          taskId: task.id,
          summary: `created ${taskKey(task.number)} “${task.title}”`,
        },
        tx,
      );
      return task.id;
    });
    return this.detail(user, id);
  }

  async detail(user: AuthUser, taskId: string): Promise<TaskDetail> {
    await this.access.byTask(user, taskId);
    const t = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: {
        ...cardInclude,
        dependsOn: { include: { dependsOn: { select: { ...refSelect } } } },
        blocks: { include: { task: { select: refSelect } } },
        comments: { orderBy: { createdAt: 'asc' }, include: { author: { select: personSelect } } },
        activity: { orderBy: { createdAt: 'desc' }, take: 30, include: activityInclude },
      },
    });
    const card = toTaskCard(t as unknown as CardRow);
    return {
      ...card,
      description: t.description,
      acceptanceCriteria: t.acceptanceCriteria,
      branch: t.branch,
      dependsOn: t.dependsOn.map((d) => toRef(d.dependsOn)),
      blocks: t.blocks.map((b) => toRef(b.task)),
      comments: t.comments.map((c) => ({
        id: c.id,
        author: toPerson(c.author),
        body: c.body,
        createdAt: c.createdAt.toISOString(),
      })),
      activity: t.activity.map(toActivityItem),
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
      allowedMoves: allowedMoves(t.status, card.blockedBy.length),
    };
  }

  async update(user: AuthUser, taskId: string, dto: UpdateTaskDto): Promise<TaskDetail> {
    const ctx = await this.access.byTask(user, taskId);
    await this.validateRefs(ctx.projectId, dto);
    const before = await this.prisma.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { assignee: { select: personSelect } },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({
        where: { id: taskId },
        data: {
          title: dto.title,
          description: dto.description,
          acceptanceCriteria: dto.acceptanceCriteria,
          priority: dto.priority,
          estimate: dto.estimate,
          roleId: dto.roleId,
          assigneeId: dto.assigneeId,
          sprintId: dto.sprintId,
          dueDate: dto.dueDate === undefined ? undefined : dto.dueDate ? new Date(dto.dueDate) : null,
          branch: dto.branch,
          pullRequestUrl: dto.pullRequestUrl,
        },
      });
      const key = taskKey(before.number);
      if (dto.assigneeId !== undefined && dto.assigneeId !== before.assigneeId) {
        const who = dto.assigneeId
          ? await tx.user.findUnique({ where: { id: dto.assigneeId }, select: personSelect })
          : null;
        await this.activity.record(
          {
            projectId: ctx.projectId,
            type: 'TASK_ASSIGNED',
            actorUserId: user.id,
            taskId,
            summary: who ? `assigned ${key} to ${toPerson(who).displayName}` : `unassigned ${key}`,
            data: { from: before.assigneeId, to: dto.assigneeId },
          },
          tx,
        );
      }
      const changed = (
        [
          'title',
          'description',
          'acceptanceCriteria',
          'priority',
          'estimate',
          'roleId',
          'sprintId',
          'dueDate',
          'branch',
          'pullRequestUrl',
        ] as const
      ).filter((k) => dto[k] !== undefined);
      if (changed.length) {
        await this.activity.record(
          {
            projectId: ctx.projectId,
            type: 'TASK_UPDATED',
            actorUserId: user.id,
            taskId,
            summary: `updated ${key} (${changed.join(', ')})`,
            data: { fields: changed },
          },
          tx,
        );
      }
    });
    return this.detail(user, taskId);
  }

  /** Board move: validates the transition and dependencies, then places the card. */
  async move(user: AuthUser, taskId: string, to: TaskStatus, beforeTaskId?: string | null): Promise<TaskDetail> {
    const ctx = await this.access.byTask(user, taskId);
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.task.findUniqueOrThrow({
        where: { id: taskId },
        include: { dependsOn: { include: { dependsOn: { select: { number: true, status: true } } } } },
      });
      const unfinished = t.dependsOn
        .filter((d) => d.dependsOn.status !== 'DONE')
        .map((d) => ({ key: taskKey(d.dependsOn.number) }));
      assertTaskMove(t.status, to, unfinished);
      if (to === 'DONE') {
        const prs = await tx.pullRequest.findMany({
          where: { taskId },
          select: { number: true, state: true, checks: true },
        });
        const why = checksGate(prs);
        if (why) throw new DomainError(ErrorCode.CHECKS_NOT_PASSING, why, HttpStatus.CONFLICT);
      }

      let position: number;
      if (beforeTaskId) {
        const anchor = await tx.task.findFirst({
          where: { id: beforeTaskId, projectId: ctx.projectId, status: to },
          select: { position: true },
        });
        if (!anchor)
          throw new DomainError(
            ErrorCode.VALIDATION_FAILED,
            'That card isn’t in the target column.',
            HttpStatus.BAD_REQUEST,
          );
        const prev = await tx.task.findFirst({
          where: { projectId: ctx.projectId, status: to, position: { lt: anchor.position }, id: { not: taskId } },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        position = positionBetween(prev?.position ?? null, anchor.position);
      } else {
        const last = await tx.task.findFirst({
          where: { projectId: ctx.projectId, status: to, id: { not: taskId } },
          orderBy: { position: 'desc' },
          select: { position: true },
        });
        position = positionBetween(last?.position ?? null, null);
      }

      // Optimistic guard: if someone moved it meanwhile, this updates nothing.
      const updated = await tx.task.updateMany({
        where: { id: taskId, status: t.status },
        data: {
          status: to,
          position,
          startedAt: to === 'IN_PROGRESS' && !t.startedAt ? new Date() : undefined,
          completedAt: to === 'DONE' ? new Date() : t.status === 'DONE' ? null : undefined,
        },
      });
      if (updated.count !== 1)
        throw new DomainError(
          ErrorCode.CONFLICT,
          'This task just changed. Refresh and try again.',
          HttpStatus.CONFLICT,
        );
      if (t.status !== to) {
        await this.activity.record(
          {
            projectId: ctx.projectId,
            type: 'TASK_STATUS_CHANGED',
            actorUserId: user.id,
            taskId,
            summary: `moved ${taskKey(t.number)} from ${label(t.status)} to ${label(to)}`,
            data: { from: t.status, to },
          },
          tx,
        );
      }
    });
    return this.detail(user, taskId);
  }

  async setDependencies(user: AuthUser, taskId: string, dependsOnIds: string[]): Promise<TaskDetail> {
    const ctx = await this.access.byTask(user, taskId);
    const unique = [...new Set(dependsOnIds)];
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${ctx.projectId}::uuid FOR UPDATE`;
      const targets = await tx.task.findMany({
        where: { id: { in: unique }, projectId: ctx.projectId },
        select: { id: true, number: true },
      });
      if (targets.length !== unique.length) {
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'Dependencies must be tasks in the same project.',
          HttpStatus.BAD_REQUEST,
        );
      }
      const all = await tx.taskDependency.findMany({ where: { task: { projectId: ctx.projectId }, NOT: { taskId } } });
      const edges = new Map<string, string[]>();
      for (const e of all) edges.set(e.taskId, [...(edges.get(e.taskId) ?? []), e.dependsOnId]);
      const cycle = findCycle(edges, taskId, unique);
      if (cycle) {
        const numbers = new Map(
          (await tx.task.findMany({ where: { id: { in: cycle } }, select: { id: true, number: true } })).map((t) => [
            t.id,
            t.number,
          ]),
        );
        throw new DomainError(
          ErrorCode.DEPENDENCY_CYCLE,
          `That would create a loop: ${cycle.map((id) => taskKey(numbers.get(id) ?? 0)).join(' → ')}.`,
          HttpStatus.CONFLICT,
        );
      }
      await tx.taskDependency.deleteMany({ where: { taskId } });
      await tx.taskDependency.createMany({ data: unique.map((d) => ({ taskId, dependsOnId: d })) });
      const self = await tx.task.findUniqueOrThrow({ where: { id: taskId }, select: { number: true } });
      await this.activity.record(
        {
          projectId: ctx.projectId,
          type: 'TASK_DEPENDENCIES_CHANGED',
          actorUserId: user.id,
          taskId,
          summary: targets.length
            ? `set ${taskKey(self.number)} to depend on ${targets.map((t) => taskKey(t.number)).join(', ')}`
            : `removed ${taskKey(self.number)}’s dependencies`,
        },
        tx,
      );
    });
    return this.detail(user, taskId);
  }

  async comment(user: AuthUser, taskId: string, body: string): Promise<TaskDetail> {
    const ctx = await this.access.byTask(user, taskId);
    await this.prisma.$transaction(async (tx) => {
      const t = await tx.taskComment.create({
        data: { taskId, authorId: user.id, body },
        include: { task: { select: { number: true } } },
      });
      await this.activity.record(
        {
          projectId: ctx.projectId,
          type: 'TASK_COMMENTED',
          actorUserId: user.id,
          taskId,
          summary: `commented on ${taskKey(t.task.number)}`,
        },
        tx,
      );
    });
    return this.detail(user, taskId);
  }

  /** Role, sprint and assignee must belong to this project; estimates must be story points. */
  private async validateRefs(
    projectId: string,
    dto: { roleId?: string | null; sprintId?: string | null; assigneeId?: string | null; estimate?: number },
  ) {
    if (dto.estimate !== undefined && !isStoryPoints(dto.estimate)) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Estimates are story points: 1, 2, 3, 5, 8 or 13.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (dto.roleId) {
      const r = await this.prisma.projectRole.findFirst({ where: { id: dto.roleId, projectId }, select: { id: true } });
      if (!r)
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'That role isn’t part of this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    if (dto.sprintId) {
      const s = await this.prisma.sprint.findFirst({ where: { id: dto.sprintId, projectId }, select: { id: true } });
      if (!s)
        throw new DomainError(
          ErrorCode.VALIDATION_FAILED,
          'That sprint isn’t part of this project.',
          HttpStatus.BAD_REQUEST,
        );
    }
    if (dto.assigneeId) await this.access.assertAssignable(projectId, dto.assigneeId);
  }
}
