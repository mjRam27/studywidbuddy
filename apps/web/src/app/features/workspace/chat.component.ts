import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  type ElementRef,
  inject,
  type OnInit,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  CHAT_MESSAGE_MAX,
  RT_EVENTS,
  type ChatMessageView,
  type PresenceEvent,
  type TypingEvent,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { WorkspaceStore } from './workspace.store';

interface Row {
  m: ChatMessageView;
  day: string | null;
  /** Same author as the previous message within a few minutes: hide the header. */
  compact: boolean;
}

/** Team chat (design: Study Workspace chat, project context). Live over sockets. */
@Component({
  selector: 'sb-ws-chat',
  imports: [FormsModule, AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="chat">
      <div class="chat-head">
        <span class="chat-scope"><i class="ms" aria-hidden="true">lock</i>TEAM</span>
        <span style="font-size:13px;font-weight:600">{{ store.overview()?.project?.title }}</span>
        <div class="chat-online" aria-label="Online now">
          @for (m of members(); track m.user.id) {
            <span
              class="face"
              [class.on]="online().has(m.user.id)"
              [title]="m.user.displayName + (online().has(m.user.id) ? ' · online' : '')"
            >
              <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [size]="24" />
            </span>
          }
          <span class="faint" style="font-size:11.5px">{{ online().size }} online</span>
        </div>
        @if (!rt.connected()) {
          <span class="status warn" title="Messages still send; they’ll appear for others when they reload"
            ><i class="ms" aria-hidden="true">wifi_off</i>Reconnecting</span
          >
        }
      </div>

      <div class="chat-list" #list (scroll)="onScroll()">
        @if (hasMore()) {
          <button
            type="button"
            class="btn btn-ghost xs"
            style="align-self:center"
            [disabled]="loadingOlder()"
            (click)="older()"
          >
            Load earlier messages
          </button>
        }
        @for (r of rows(); track r.m.id) {
          @if (r.day) {
            <div class="chat-day">{{ r.day }}</div>
          }
          @if (r.m.authorKind !== 'MEMBER') {
            <div class="chat-ai">
              <span class="ai-label"
                ><span class="ai-diamond" aria-hidden="true"></span>AI PM · {{ time(r.m.createdAt) }}</span
              >
              <span class="t">{{ r.m.body }}</span>
              @if (r.m.ref?.type === 'meeting') {
                <button
                  type="button"
                  class="link-btn"
                  style="align-self:flex-start"
                  (click)="openMeeting.emit(r.m.ref!.id)"
                >
                  Open meeting
                </button>
              }
            </div>
          } @else if (r.m.author?.id === me()) {
            <div class="chat-msg mine" [class.compact]="r.compact">
              @if (!r.compact) {
                <span class="meta">You · {{ time(r.m.createdAt) }}</span>
              }
              <div class="bubble">{{ r.m.body }}</div>
            </div>
          } @else {
            <div class="chat-msg" [class.compact]="r.compact">
              @if (!r.compact) {
                <sb-avatar [name]="r.m.author?.displayName ?? '?'" [colorKey]="r.m.author?.id ?? ''" [size]="30" />
              } @else {
                <span style="width:30px;flex-shrink:0"></span>
              }
              <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
                @if (!r.compact) {
                  <span class="meta"
                    ><b>{{ r.m.author?.displayName }}</b> · {{ time(r.m.createdAt) }}</span
                  >
                }
                <div class="bubble">{{ r.m.body }}</div>
              </div>
            </div>
          }
        } @empty {
          <div class="faint sm" style="align-self:center;text-align:center;max-width:360px;margin:auto">
            No messages yet. Say hello to your team. The AI PM posts meeting notices and summaries here too.
          </div>
        }
      </div>

      <div class="chat-compose">
        @if (typing(); as t) {
          <span class="faint" style="font-size:11.5px">{{ t }} is typing…</span>
        }
        <form class="chat-box" (ngSubmit)="send()">
          <label class="sr-only" for="chat-input">Message your team</label>
          <textarea
            id="chat-input"
            name="body"
            rows="1"
            [(ngModel)]="draft"
            [maxlength]="max"
            placeholder="Message your team…"
            (keydown.enter)="enter($event)"
            (input)="typed()"
          ></textarea>
          <button type="submit" class="icon-btn send" [disabled]="sending() || !draft.trim()" title="Send">
            <i class="ms" aria-hidden="true">arrow_upward</i>
          </button>
        </form>
      </div>
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class ChatComponent implements OnInit {
  readonly store = inject(WorkspaceStore);
  readonly rt = inject(RealtimeService);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly openMeeting = output<string>();
  readonly messages = signal<ChatMessageView[]>([]);
  readonly hasMore = signal(false);
  readonly loadingOlder = signal(false);
  readonly sending = signal(false);
  readonly online = signal<Set<string>>(new Set());
  readonly typingUsers = signal<Map<string, { name: string; at: number }>>(new Map());
  readonly max = CHAT_MESSAGE_MAX;
  readonly me = computed(() => this.auth.user()?.id);
  readonly members = computed(() => this.store.overview()?.members ?? []);
  draft = '';
  private readonly list = viewChild<ElementRef<HTMLElement>>('list');
  private atBottom = true;
  private lastTyped = 0;
  private readonly destroyRef = inject(DestroyRef);

  readonly rows = computed<Row[]>(() => {
    let prevDay = '';
    let prev: ChatMessageView | null = null;
    return this.messages().map((m) => {
      const d = new Date(m.createdAt);
      const day = d.toDateString();
      const showDay = day !== prevDay;
      const compact =
        !showDay &&
        !!prev &&
        prev.authorKind === 'MEMBER' &&
        m.authorKind === 'MEMBER' &&
        prev.author?.id === m.author?.id &&
        d.getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000;
      prevDay = day;
      prev = m;
      return { m, compact, day: showDay ? this.dayLabel(d) : null };
    });
  });

  readonly typing = computed(() => {
    const now = Date.now();
    const names = [...this.typingUsers().values()].filter((t) => now - t.at < 4000).map((t) => t.name);
    return names.length ? names.join(', ') : null;
  });

  async ngOnInit() {
    const o = this.store.overview();
    if (!o) return;
    const projectId = o.project.id;
    const offs = [
      this.rt.on<ChatMessageView>(RT_EVENTS.CHAT_MESSAGE, (m) => {
        if (m.projectId !== projectId || this.messages().some((x) => x.id === m.id)) return;
        this.messages.update((list) => [...list, m]);
        this.typingUsers.update((t) => {
          const n = new Map(t);
          if (m.author) n.delete(m.author.id);
          return n;
        });
        if (this.atBottom) this.scrollDown();
        void this.api.markChatRead(this.store.slug()).catch(() => undefined);
      }),
      this.rt.on<PresenceEvent>(RT_EVENTS.PRESENCE, (p) => {
        if (p.projectId === projectId) this.online.set(new Set(p.online));
      }),
      this.rt.on<TypingEvent>(RT_EVENTS.TYPING, (t) => {
        if (t.projectId !== projectId) return;
        this.typingUsers.update((m) => new Map(m).set(t.user.id, { name: t.user.displayName, at: Date.now() }));
        setTimeout(() => this.typingUsers.update((m) => new Map(m)), 4100);
      }),
    ];
    void this.rt.joinProject(projectId);
    this.destroyRef.onDestroy(() => {
      offs.forEach((off) => off());
      this.rt.leaveProject(projectId);
    });

    try {
      const page = await this.api.chat(this.store.slug());
      this.messages.set(page.messages);
      this.hasMore.set(page.hasMore);
      this.scrollDown();
      await this.api.markChatRead(this.store.slug());
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async older() {
    const first = this.messages()[0];
    if (!first) return;
    this.loadingOlder.set(true);
    const el = this.list()?.nativeElement;
    const before = el ? el.scrollHeight - el.scrollTop : 0;
    try {
      const page = await this.api.chat(this.store.slug(), first.id);
      this.messages.update((list) => [...page.messages, ...list]);
      this.hasMore.set(page.hasMore);
      // Keep the reader's position after prepending.
      queueMicrotask(() => {
        if (el) el.scrollTop = el.scrollHeight - before;
      });
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.loadingOlder.set(false);
    }
  }

  enter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    k.preventDefault();
    void this.send();
  }

  typed() {
    const o = this.store.overview();
    if (!o || Date.now() - this.lastTyped < 2500) return;
    this.lastTyped = Date.now();
    this.rt.emit(RT_EVENTS.TYPING, { projectId: o.project.id });
  }

  async send() {
    const body = this.draft.trim();
    if (!body || this.sending()) return;
    this.sending.set(true);
    try {
      const m = await this.api.sendChat(this.store.slug(), body);
      this.draft = '';
      if (!this.messages().some((x) => x.id === m.id)) this.messages.update((list) => [...list, m]);
      this.scrollDown();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.sending.set(false);
    }
  }

  onScroll() {
    const el = this.list()?.nativeElement;
    if (el) this.atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  time(iso: string) {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }

  private dayLabel(d: Date) {
    const today = new Date();
    const yesterday = new Date(Date.now() - 86_400_000);
    if (d.toDateString() === today.toDateString()) return 'TODAY';
    if (d.toDateString() === yesterday.toDateString()) return 'YESTERDAY';
    return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  }

  private scrollDown() {
    queueMicrotask(() => {
      const el = this.list()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
