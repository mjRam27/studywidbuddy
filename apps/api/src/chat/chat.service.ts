import { Injectable } from '@nestjs/common';
import { ChatAuthorKind, Prisma } from '@prisma/client';
import { RT_EVENTS } from '@studywidbuddy/shared';
import type { ChatMessageView, ChatPage } from '@studywidbuddy/shared';
import type { AuthUser } from '../common/auth/auth-user';
import { notFound } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WorkspaceAccess } from '../tasks/workspace-access.service';

const PAGE = 50;
const include = { author: { select: personSelect } } satisfies Prisma.ChatMessageInclude;
type Row = Prisma.ChatMessageGetPayload<{ include: typeof include }>;

export const toChatMessage = (m: Row): ChatMessageView => ({
  id: m.id,
  projectId: m.projectId,
  author: m.author ? toPerson(m.author) : null,
  authorKind: m.authorKind,
  body: m.body,
  ref: m.refType && m.refId ? { type: m.refType, id: m.refId } : null,
  createdAt: m.createdAt.toISOString(),
});

/** Project team chat. Members write through REST; every saved message is pushed over sockets. */
@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccess,
    private readonly realtime: RealtimeGateway,
  ) {}

  async page(user: AuthUser, slug: string, before?: string): Promise<ChatPage> {
    const ctx = await this.access.bySlug(user, slug);
    let cursor: { createdAt: Date; id: string } | null = null;
    if (before) {
      cursor = await this.prisma.chatMessage.findFirst({
        where: { id: before, projectId: ctx.projectId },
        select: { createdAt: true, id: true },
      });
      if (!cursor) throw notFound('Message');
    }
    const [rows, read] = await Promise.all([
      this.prisma.chatMessage.findMany({
        where: {
          projectId: ctx.projectId,
          deletedAt: null,
          ...(cursor
            ? {
                OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }],
              }
            : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: PAGE + 1,
        include,
      }),
      this.prisma.chatReadState.findUnique({
        where: { projectId_userId: { projectId: ctx.projectId, userId: user.id } },
      }),
    ]);
    return {
      messages: rows.slice(0, PAGE).reverse().map(toChatMessage),
      hasMore: rows.length > PAGE,
      lastReadAt: read?.lastReadAt.toISOString() ?? null,
    };
  }

  async send(user: AuthUser, slug: string, body: string): Promise<ChatMessageView> {
    const ctx = await this.access.bySlug(user, slug);
    const m = await this.prisma.chatMessage.create({
      data: { projectId: ctx.projectId, authorId: user.id, authorKind: ChatAuthorKind.MEMBER, body: body.trim() },
      include,
    });
    const view = toChatMessage(m);
    await this.markRead(user, slug, m.createdAt);
    this.realtime.emitToProject(ctx.projectId, RT_EVENTS.CHAT_MESSAGE, view);
    return view;
  }

  async markRead(user: AuthUser, slug: string, at = new Date()) {
    const ctx = await this.access.bySlug(user, slug);
    await this.prisma.chatReadState.upsert({
      where: { projectId_userId: { projectId: ctx.projectId, userId: user.id } },
      create: { projectId: ctx.projectId, userId: user.id, lastReadAt: at },
      update: { lastReadAt: at },
    });
  }

  async unread(user: AuthUser, slug: string): Promise<number> {
    const ctx = await this.access.bySlug(user, slug);
    const read = await this.prisma.chatReadState.findUnique({
      where: { projectId_userId: { projectId: ctx.projectId, userId: user.id } },
    });
    return this.prisma.chatMessage.count({
      where: {
        projectId: ctx.projectId,
        deletedAt: null,
        authorId: { not: user.id },
        ...(read ? { createdAt: { gt: read.lastReadAt } } : {}),
      },
    });
  }

  /** Posts as the AI PM (or the system). Used by meetings and agent runs. */
  async postAsAi(
    projectId: string,
    body: string,
    ref?: { type: string; id: string },
    kind: ChatAuthorKind = ChatAuthorKind.AI,
  ): Promise<ChatMessageView> {
    const m = await this.prisma.chatMessage.create({
      data: { projectId, authorKind: kind, body: body.trim(), refType: ref?.type, refId: ref?.id },
      include,
    });
    const view = toChatMessage(m);
    this.realtime.emitToProject(projectId, RT_EVENTS.CHAT_MESSAGE, view);
    return view;
  }
}
