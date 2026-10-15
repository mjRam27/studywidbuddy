import { Injectable } from '@nestjs/common';
import { type MemoryKind, Prisma } from '@prisma/client';
import type { MemoryItem } from '@studywidbuddy/shared';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';

/** How much memory goes into each prompt. Older entries stay readable through the tool. */
export const MEMORY_IN_PROMPT = 40;
export const MEMORY_CONTENT_MAX = 600;

/**
 * The AI PM's memory, one store per project. Every query is filtered by projectId; there
 * is no code path that reads memory across projects.
 */
@Injectable()
export class MemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async list(projectId: string, opts: { limit?: number; kind?: MemoryKind } = {}): Promise<MemoryItem[]> {
    const rows = await this.prisma.projectMemory.findMany({
      where: { projectId, archivedAt: null, kind: opts.kind },
      orderBy: { createdAt: 'desc' },
      take: opts.limit ?? 100,
    });
    const subjects = await this.people(rows.map((r) => r.subjectUserId));
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      content: r.content,
      subject: r.subjectUserId ? (subjects.get(r.subjectUserId) ?? null) : null,
      sourceType: r.sourceType,
      sourceId: r.sourceId,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async write(
    projectId: string,
    entry: { kind: MemoryKind; content: string; subjectUserId?: string | null },
    source: { type: 'MEETING' | 'RUN' | 'MANUAL'; id?: string | null },
    tx: Prisma.TransactionClient = this.prisma,
  ) {
    return tx.projectMemory.create({
      data: {
        projectId,
        kind: entry.kind,
        content: entry.content.trim().slice(0, MEMORY_CONTENT_MAX),
        subjectUserId: entry.subjectUserId ?? null,
        sourceType: source.type,
        sourceId: source.id ?? null,
      },
    });
  }

  /** Team members can remove a memory that's wrong; it's archived, not deleted, for the audit trail. */
  async archive(projectId: string, id: string): Promise<boolean> {
    const r = await this.prisma.projectMemory.updateMany({
      where: { id, projectId, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    return r.count === 1;
  }

  /** Memory as prompt text, newest first, with usernames instead of ids. */
  async promptBlock(projectId: string): Promise<string> {
    const items = await this.list(projectId, { limit: MEMORY_IN_PROMPT });
    if (!items.length) return '(no memory yet: this is the start of the project)';
    return items
      .map(
        (m) =>
          `- [${m.kind}${m.subject ? ` about @${m.subject.username}` : ''} · ${m.createdAt.slice(0, 10)}] ${m.content}`,
      )
      .join('\n');
  }

  private async people(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    if (!unique.length) return new Map();
    const rows = await this.prisma.user.findMany({ where: { id: { in: unique } }, select: personSelect });
    return new Map(rows.map((r) => [r.id, toPerson(r)]));
  }
}
