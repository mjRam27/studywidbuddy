import { effect, inject, Injectable, NgZone, signal } from '@angular/core';
import { RT_EVENTS, type JoinProjectAck } from '@studywidbuddy/shared';
import { firstValueFrom } from 'rxjs';
import { io, type Socket } from 'socket.io-client';
import { AuthService } from './auth.service';

/**
 * One socket.io connection for the signed-in user (path /api/socket.io, through the same
 * proxy as REST). Rooms are re-joined after reconnects; an expired access token is
 * refreshed once and the connection retried.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly auth = inject(AuthService);
  private readonly zone = inject(NgZone);
  private socket: Socket | null = null;
  private readonly rooms = new Map<string, number>();
  private refreshing = false;

  readonly connected = signal(false);

  constructor() {
    // Signed out (or session lost): drop the connection and its rooms.
    effect(() => {
      if (!this.auth.user()) this.disconnect();
    });
  }

  private ensure(): Socket {
    if (this.socket) return this.socket;
    const s = io({
      path: '/api/socket.io',
      transports: ['websocket'],
      // A function, so every (re)connect sends the current token.
      auth: (cb) => cb({ token: this.auth.token }),
    });
    s.on('connect', () =>
      this.zone.run(() => {
        this.connected.set(true);
        for (const id of this.rooms.keys()) s.emit(RT_EVENTS.JOIN_PROJECT, { projectId: id });
      }),
    );
    s.on('disconnect', () => this.zone.run(() => this.connected.set(false)));
    s.on('connect_error', async (err) => {
      if (err.message !== 'unauthorized' || this.refreshing) return;
      this.refreshing = true;
      try {
        if (await firstValueFrom(this.auth.refresh())) s.connect();
      } finally {
        this.refreshing = false;
      }
    });
    this.socket = s;
    return s;
  }

  /** Joins a project room (membership is checked by the server). Ref-counted. */
  async joinProject(projectId: string): Promise<JoinProjectAck> {
    const s = this.ensure();
    this.rooms.set(projectId, (this.rooms.get(projectId) ?? 0) + 1);
    if (!s.connected) return { ok: true }; // joined on connect
    return new Promise((resolve) =>
      s
        .timeout(5000)
        .emit(RT_EVENTS.JOIN_PROJECT, { projectId }, (err: Error | null, ack: JoinProjectAck) =>
          resolve(err ? { ok: false, error: 'Realtime is unavailable.' } : ack),
        ),
    );
  }

  leaveProject(projectId: string) {
    const n = (this.rooms.get(projectId) ?? 1) - 1;
    if (n > 0) {
      this.rooms.set(projectId, n);
      return;
    }
    this.rooms.delete(projectId);
    this.socket?.emit(RT_EVENTS.LEAVE_PROJECT, { projectId });
  }

  /** Subscribe to a server event; returns an unsubscribe function. Handlers run in the zone. */
  on<T>(event: string, handler: (payload: T) => void): () => void {
    const s = this.ensure();
    const wrapped = (p: T) => this.zone.run(() => handler(p));
    s.on(event, wrapped);
    return () => s.off(event, wrapped);
  }

  emit(event: string, payload: unknown) {
    this.socket?.emit(event, payload);
  }

  /** On sign-out. */
  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.rooms.clear();
    this.connected.set(false);
  }
}
