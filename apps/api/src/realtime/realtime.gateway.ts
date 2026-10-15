import { Inject, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayDisconnect,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { RT_EVENTS } from '@studywidbuddy/shared';
import type { JoinProjectAck, PresenceEvent, TypingEvent } from '@studywidbuddy/shared';
import type { Server, Socket } from 'socket.io';
import type { AuthUser } from '../common/auth/auth-user';
import type { AccessTokenClaims } from '../common/auth/jwt-auth.guard';
import { ENV, type Env } from '../common/config/env';
import { PrismaService } from '../common/prisma/prisma.service';
import { WorkspaceAccess } from '../tasks/workspace-access.service';

interface SocketData {
  user: AuthUser;
  displayName: string;
  projects: Set<string>;
}

const room = (projectId: string) => `project:${projectId}`;
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Realtime transport. Clients authenticate with their access token in the handshake, then
 * join project rooms; joining re-checks team membership, exactly like the REST workspace.
 * Messages are written through REST and broadcast from here, so every message is validated
 * and stored before anyone sees it.
 *
 * Presence is tracked in memory per API instance. Running several instances needs the
 * socket.io Redis adapter (documented in docs/REALTIME.md).
 */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  /** projectId → userId → open socket count */
  private readonly presence = new Map<string, Map<string, number>>();

  @WebSocketServer() server: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly access: WorkspaceAccess,
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Authenticate in middleware, so the handshake is rejected before any event can arrive
   * (a connection handler would race with the client's first "join").
   */
  afterInit(server: Server) {
    server.use((socket, next) => {
      void this.authenticate(socket).then(
        () => next(),
        () => next(new Error('unauthorized')),
      );
    });
  }

  private async authenticate(socket: Socket) {
    const token = (socket.handshake.auth as { token?: unknown } | undefined)?.token;
    if (typeof token !== 'string') throw new Error('no token');
    const claims = await this.jwt.verifyAsync<AccessTokenClaims>(token, {
      secret: this.env.JWT_ACCESS_SECRET,
      algorithms: ['HS256'],
    });
    if (claims.typ !== 'access') throw new Error('wrong token type');
    const profile = await this.prisma.profile.findUnique({
      where: { userId: claims.sub },
      select: { displayName: true },
    });
    const data: SocketData = {
      user: { id: claims.sub, role: claims.role },
      displayName: profile?.displayName ?? 'Someone',
      projects: new Set(),
    };
    socket.data = data;
  }

  handleDisconnect(socket: Socket) {
    const data = socket.data as SocketData | undefined;
    if (!data?.user) return;
    for (const projectId of data.projects) this.leave(projectId, data.user.id);
  }

  @SubscribeMessage(RT_EVENTS.JOIN_PROJECT)
  async join(@ConnectedSocket() socket: Socket, @MessageBody() body: { projectId?: unknown }): Promise<JoinProjectAck> {
    const data = socket.data as SocketData | undefined;
    const projectId = body?.projectId;
    if (!data?.user || typeof projectId !== 'string' || !UUID.test(projectId)) {
      return { ok: false, error: 'Bad request.' };
    }
    try {
      await this.access.byId(data.user, projectId);
    } catch {
      return { ok: false, error: 'Only team members can join this project.' };
    }
    if (!data.projects.has(projectId)) {
      data.projects.add(projectId);
      await socket.join(room(projectId));
      const users = this.presence.get(projectId) ?? new Map<string, number>();
      users.set(data.user.id, (users.get(data.user.id) ?? 0) + 1);
      this.presence.set(projectId, users);
      this.broadcastPresence(projectId);
    }
    return { ok: true };
  }

  @SubscribeMessage(RT_EVENTS.LEAVE_PROJECT)
  async leaveRoom(@ConnectedSocket() socket: Socket, @MessageBody() body: { projectId?: unknown }) {
    const data = socket.data as SocketData | undefined;
    const projectId = body?.projectId;
    if (!data?.user || typeof projectId !== 'string' || !data.projects.has(projectId)) return;
    data.projects.delete(projectId);
    await socket.leave(room(projectId));
    this.leave(projectId, data.user.id);
  }

  @SubscribeMessage(RT_EVENTS.TYPING)
  typing(@ConnectedSocket() socket: Socket, @MessageBody() body: { projectId?: unknown }) {
    const data = socket.data as SocketData | undefined;
    const projectId = body?.projectId;
    if (!data?.user || typeof projectId !== 'string' || !data.projects.has(projectId)) return;
    const event: TypingEvent = { projectId, user: { id: data.user.id, displayName: data.displayName } };
    socket.to(room(projectId)).emit(RT_EVENTS.TYPING, event);
  }

  /** Server-side broadcast to everyone in a project room. */
  emitToProject(projectId: string, event: string, payload: unknown) {
    if (!this.server) return; // no socket server (e.g. some tests): REST still works
    this.server.to(room(projectId)).emit(event, payload);
  }

  online(projectId: string): string[] {
    return [...(this.presence.get(projectId)?.keys() ?? [])];
  }

  private leave(projectId: string, userId: string) {
    const users = this.presence.get(projectId);
    if (!users) return;
    const n = (users.get(userId) ?? 1) - 1;
    if (n <= 0) users.delete(userId);
    else users.set(userId, n);
    if (!users.size) this.presence.delete(projectId);
    this.broadcastPresence(projectId);
  }

  private broadcastPresence(projectId: string) {
    const event: PresenceEvent = { projectId, online: this.online(projectId) };
    this.emitToProject(projectId, RT_EVENTS.PRESENCE, event);
    this.logger.debug(`presence ${projectId}: ${event.online.length} online`);
  }
}
