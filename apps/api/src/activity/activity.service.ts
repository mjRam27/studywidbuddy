import { Injectable } from '@nestjs/common';
import { type ActivityType, type ActorKind, Prisma } from '@prisma/client';
import type { ActivityItem, Page } from '@studywidbuddy/shared';
import { afterCursor, decodeCursor, DEFAULT_PAGE_SIZE, toPage } from '../common/http/pagination';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';

export interface ActivityInput {
  projectId: string;
  type: ActivityType;
  summary: string;
  actorUserId?: string | null;
  actorKind?: ActorKind;
  taskId?: string | null;
  data?: Prisma.InputJsonValue;
}

const include = {
  actor: { select: personSelect },
  task: { select: { id: true, number: true } },
} satisfies Prisma.ProjectActivityInclude;
type Row = Prisma.ProjectActivityGetPayload<{ include: typeof include }>;

/** Append-only project timeline. Write inside the same transaction as the change it records. */
@Injectable()
export class ActivityService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: ActivityInput, tx: Prisma.TransactionClient = this.prisma) {
    return tx.projectActivity.create({
      data: {
        projectId: input.projectId,
        type: input.type,
        summary: input.summary,
        actorUserId: input.actorUserId ?? null,
        actorKind: input.actorKind ?? 'USER',
        taskId: input.taskId ?? null,
        data: input.data,
      },
    });
  }

  async list(
    projectId: string,
    opts: { cursor?: string; limit?: number; taskId?: string } = {},
  ): Promise<Page<ActivityItem>> {
    const limit = opts.limit ?? DEFAULT_PAGE_SIZE;
    const rows = await this.prisma.projectActivity.findMany({
      where: { projectId, taskId: opts.taskId, ...afterCursor(decodeCursor(opts.cursor)) },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include,
    });
    return toPage(rows, limit, toActivityItem);
  }
}

export function toActivityItem(r: Row): ActivityItem {
  return {
    id: r.id,
    type: r.type,
    actorKind: r.actorKind,
    actor: r.actor ? toPerson(r.actor) : null,
    task: r.task ? { id: r.task.id, key: `TASK-${r.task.number}` } : null,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
  };
}

export const activityInclude = include;
