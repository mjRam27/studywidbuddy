import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  MEETING_ANSWER_MAX,
  RT_EVENTS,
  type MeetingSummary,
  type MeetingView,
  type PmOverview,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { Speech } from '../../core/speech';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { SkeletonComponent } from '../../ui/states.component';
import { WorkspaceStore } from './workspace.store';

/**
 * Meetings tab. The AI PM runs a check-in every few days and a final review at the end:
 * each member answers their own questions, by voice or text, inside the window. After
 * everyone has answered (or the window closes) the AI PM writes the summary.
 */
@Component({
  selector: 'sb-ws-meetings',
  imports: [FormsModule, AvatarComponent, SkeletonComponent],
  providers: [Speech],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      @if (!meetingId()) {
        @if (!pm()) {
          <sb-skeleton [rows]="4" [height]="22" />
        } @else {
          @let o = pm()!;
          <div class="ws-grid">
            <section class="ws-card wide" aria-labelledby="mt-h">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="ai-label" id="mt-h"
                  ><span class="ai-diamond" aria-hidden="true"></span>AI PM · TEAM MEETINGS</span
                >
                <span class="faint" style="font-size:12px"
                  >A check-in every {{ o.meetingIntervalDays }} day{{ o.meetingIntervalDays === 1 ? '' : 's' }}, and a
                  final review near the end. Answer by voice or text.</span
                >
              </div>
              @if (!o.aiConfigured) {
                <div class="banner warn" style="font-size:12.5px">
                  <i class="ms" aria-hidden="true">cloud_off</i>AI meetings aren’t available on this server yet.
                </div>
              } @else if (!o.enabled) {
                <div class="banner" style="font-size:12.5px">
                  <i class="ms" aria-hidden="true">pause_circle</i>The AI PM is paused for this project.
                </div>
              }
              @if (o.openMeeting; as m) {
                <button type="button" class="meet-open" (click)="open.emit(m.id)">
                  <span class="voice-orb" [class.listening]="m.status === 'OPEN'" aria-hidden="true"
                    ><i class="ms">groups</i></span
                  >
                  <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">
                    <span style="font-size:14px;font-weight:600">{{ title(m) }} · {{ statusLabel(m.status) }}</span>
                    <span class="faint" style="font-size:12px"
                      >{{ m.answered }} of {{ m.participants }} answered · closes {{ when(m.closesAt) }}</span
                    >
                  </span>
                  @if (m.myStatus === 'PENDING' && m.status === 'OPEN') {
                    <span class="btn btn-primary xs">Join and answer</span>
                  } @else {
                    <span class="btn btn-secondary xs">Open</span>
                  }
                </button>
              } @else {
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span class="sm">{{
                    o.nextCheckInAt ? 'Next check-in ' + when(o.nextCheckInAt) + '.' : 'No check-in is scheduled.'
                  }}</span>
                  <button
                    type="button"
                    class="btn btn-secondary xs"
                    [disabled]="busy() || !o.aiConfigured || !o.enabled"
                    (click)="start('CHECK_IN')"
                  >
                    <i class="ms" aria-hidden="true">play_arrow</i>Start a check-in now
                  </button>
                  @if (isAdmin()) {
                    <button
                      type="button"
                      class="btn btn-ghost xs"
                      [disabled]="busy() || !o.aiConfigured || !o.enabled"
                      (click)="start('FINAL_REVIEW')"
                    >
                      Start the final review
                    </button>
                  }
                </div>
              }
            </section>

            <section class="ws-card wide" aria-labelledby="past-h">
              <span class="ws-card-title" id="past-h">All meetings</span>
              @for (m of o.meetings; track m.id) {
                <button
                  type="button"
                  class="ws-row"
                  style="background:none;border-left:0;border-right:0;border-bottom:0;width:100%;text-align:left"
                  (click)="open.emit(m.id)"
                >
                  <span class="key">#{{ m.number }}</span>
                  <span class="grow">{{ title(m) }}</span>
                  <span class="faint" style="font-size:11.5px">{{ m.answered }}/{{ m.participants }} answered</span>
                  <span class="status" [class]="'status ' + statusClass(m.status)">{{ statusLabel(m.status) }}</span>
                  <span class="faint" style="font-size:11.5px">{{ date(m.opensAt) }}</span>
                </button>
              } @empty {
                <span class="faint sm"
                  >No meetings yet. The first check-in opens {{ o.meetingIntervalDays }} days after the project
                  starts.</span
                >
              }
            </section>
          </div>
        }
      } @else if (!m()) {
        <sb-skeleton [rows]="5" [height]="22" />
      } @else {
        @let v = m()!;
        <div class="meet">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn btn-ghost xs" (click)="open.emit(null)">
              <i class="ms" aria-hidden="true">arrow_back</i>Meetings
            </button>
            <span class="ai-label"
              ><span class="ai-diamond" aria-hidden="true"></span>{{ title(v).toUpperCase() }}</span
            >
            <span class="status" [class]="'status ' + statusClass(v.status)">{{ statusLabel(v.status) }}</span>
            <span class="faint" style="margin-left:auto;font-size:12px"
              >{{ v.answered }} of {{ v.participants }} answered ·
              {{ v.status === 'OPEN' ? 'closes ' + when(v.closesAt) : date(v.opensAt) }}</span
            >
          </div>

          @switch (v.status) {
            @case ('PREPARING') {
              <div class="ai-frame" style="display:flex;gap:10px;align-items:center" aria-live="polite">
                <span class="spinner" aria-hidden="true"></span>The AI PM is reading the board and its notes to prepare
                everyone’s questions…
              </div>
            }
            @case ('SUMMARIZING') {
              <div class="ai-frame" style="display:flex;gap:10px;align-items:center" aria-live="polite">
                <span class="spinner" aria-hidden="true"></span>Everyone’s in. The AI PM is writing the summary…
              </div>
            }
            @case ('FAILED') {
              <div class="banner danger">
                <i class="ms" aria-hidden="true">sync_problem</i><span class="grow">{{ v.failureMessage }}</span>
                <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="retry()">Retry</button>
              </div>
            }
          }

          @if (v.agenda) {
            <div class="ai-frame">
              <span class="mono faint" style="font-size:10.5px;letter-spacing:.06em">AGENDA</span>
              <p class="sm" style="line-height:1.55;margin-top:4px">{{ v.agenda }}</p>
            </div>
          }

          @if (v.status === 'OPEN' && myQuestions(); as qs) {
            <section class="ws-card" aria-labelledby="my-h">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="ws-card-title" id="my-h">Your questions</span>
                <span class="faint" style="font-size:12px">{{ answeredCount() }} of {{ qs.length }} answered</span>
                @if (speech.canListen && answeredCount() < qs.length) {
                  <button
                    type="button"
                    class="btn btn-primary xs"
                    style="margin-left:auto"
                    [disabled]="busy() || voiceRunning()"
                    (click)="voiceMeeting()"
                  >
                    <i class="ms" aria-hidden="true">record_voice_over</i>Answer by voice
                  </button>
                }
              </div>
              @if (voiceRunning()) {
                <div class="voice-live" style="margin:0">
                  <div
                    class="voice-orb"
                    [class.listening]="speech.listening()"
                    [class.speaking]="speech.speaking()"
                    aria-hidden="true"
                  >
                    <i class="ms">{{ speech.speaking() ? 'volume_up' : 'graphic_eq' }}</i>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1" aria-live="polite">
                    <span style="font-size:12.5px;font-weight:600">{{
                      speech.speaking() ? 'AI PM is asking question ' + (active() + 1) : 'Listening… take your time'
                    }}</span>
                    <span class="faint" style="font-size:12.5px">{{ speech.heard() || qs[active()].prompt }}</span>
                  </div>
                  @if (speech.listening()) {
                    <button type="button" class="btn btn-primary xs" (click)="speech.stop()">Done answering</button>
                  }
                  <button type="button" class="btn btn-ghost xs" (click)="stopVoice()">Stop</button>
                </div>
              }
              @if (speech.error(); as err) {
                <span class="field-error">{{ err }}</span>
              }
              @for (q of qs; track q.position; let i = $index) {
                <div class="meet-q" [class.cur]="voiceRunning() && i === active()">
                  <span class="mono faint" style="font-size:11px">Q{{ q.position }}</span>
                  <span style="font-size:14px;font-weight:600;line-height:1.4">{{ q.prompt }}</span>
                  <label class="sr-only" [for]="'mq-' + q.position">Your answer to question {{ q.position }}</label>
                  <textarea
                    [id]="'mq-' + q.position"
                    class="input"
                    rows="3"
                    [maxlength]="maxAnswer"
                    [ngModel]="drafts()[q.position] ?? q.answer ?? ''"
                    (ngModelChange)="setDraft(q.position, $event)"
                    placeholder="Type your answer, or use “Answer by voice”."
                  ></textarea>
                  <div style="display:flex;align-items:center;gap:8px">
                    <button
                      type="button"
                      class="btn btn-secondary xs"
                      [disabled]="busy() || !dirty(q.position, q.answer)"
                      (click)="save(q.position)"
                    >
                      Save
                    </button>
                    <span class="faint" style="font-size:11.5px">{{
                      q.answer ? 'Saved' + (q.viaVoice ? ' · spoken' : '') : 'Not answered'
                    }}</span>
                  </div>
                </div>
              }
            </section>
          }

          @if (v.status === 'CLOSED') {
            <section class="report-hero" style="flex-direction:column;align-items:stretch">
              <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>SUMMARY</span>
              <p style="font-size:14px;line-height:1.6">{{ v.summary }}</p>
            </section>
            <div class="report-grid">
              <div class="ws-card">
                <span class="ws-card-title">Highlights</span>
                @for (x of v.highlights; track x) {
                  <span class="sm"><i class="ms ok-ic" aria-hidden="true">check_circle</i> {{ x }}</span>
                } @empty {
                  <span class="faint sm">None noted.</span>
                }
              </div>
              <div class="ws-card">
                <span class="ws-card-title">Risks</span>
                @for (x of v.risks; track x) {
                  <span class="sm"><i class="ms warn-ic" aria-hidden="true">warning</i> {{ x }}</span>
                } @empty {
                  <span class="faint sm">None noted.</span>
                }
              </div>
            </div>
          }

          <section class="ws-card" aria-labelledby="ppl-h">
            <span class="ws-card-title" id="ppl-h">Team</span>
            @for (p of v.people; track p.user.id) {
              <div class="meet-person">
                <div style="display:flex;align-items:center;gap:10px">
                  <sb-avatar [name]="p.user.displayName" [colorKey]="p.user.id" [size]="28" />
                  <span class="grow" style="font-size:13px;font-weight:600">{{ p.user.displayName }}</span>
                  <span class="status" [class]="'status ' + personClass(p.status)"
                    ><i class="ms" aria-hidden="true">{{ personIcon(p.status) }}</i
                    >{{ personLabel(p.status) }}</span
                  >
                </div>
                @if (p.aiNote) {
                  <div class="buddy-ai" style="margin-top:6px">
                    <span class="k">AI PM NOTE</span><span class="t">{{ p.aiNote }}</span>
                  </div>
                }
                @if (v.status === 'CLOSED' && p.questions?.length) {
                  <details style="margin-top:6px">
                    <summary class="sm" style="cursor:pointer;color:var(--ink-2)">Answers</summary>
                    @for (q of p.questions; track q.position) {
                      <div class="report-ans" style="margin-top:6px">
                        <span class="k">Q{{ q.position }} · {{ q.prompt }}</span
                        >{{ q.answer ?? '(no answer)' }}
                      </div>
                    }
                  </details>
                }
              </div>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class MeetingsComponent {
  readonly store = inject(WorkspaceStore);
  readonly speech = inject(Speech);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly rt = inject(RealtimeService);
  private readonly toast = inject(ToastService);

  readonly meetingId = input<string | null>(null);
  readonly open = output<string | null>();

  readonly pm = signal<PmOverview | null>(null);
  readonly m = signal<MeetingView | null>(null);
  readonly busy = signal(false);
  readonly drafts = signal<Partial<Record<number, string>>>({});
  readonly voiceRunning = signal(false);
  readonly active = signal(0);
  readonly maxAnswer = MEETING_ANSWER_MAX;
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly myQuestions = computed(
    () => this.m()?.people.find((p) => p.user.id === this.auth.user()?.id)?.questions ?? null,
  );
  readonly answeredCount = computed(() => (this.myQuestions() ?? []).filter((q) => !!q.answer).length);
  private draftVoice = new Set<number>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      const id = this.meetingId();
      untracked(() => {
        this.m.set(null);
        this.drafts.set({});
        this.stopVoice();
        if (id) void this.loadMeeting(id);
        else void this.loadList();
      });
    });
    const projectId = this.store.overview()?.project.id;
    if (projectId) {
      void this.rt.joinProject(projectId);
      const off = this.rt.on<{ projectId: string; meetingId: string }>(RT_EVENTS.MEETING_UPDATED, (e) => {
        if (e.projectId !== projectId) return;
        if (this.meetingId() === e.meetingId) void this.loadMeeting(e.meetingId, true);
        else if (!this.meetingId()) void this.loadList();
      });
      inject(DestroyRef).onDestroy(() => {
        off();
        this.rt.leaveProject(projectId);
        clearTimeout(this.timer);
      });
    }
  }

  private async loadList() {
    try {
      this.pm.set(await this.api.pm(this.store.slug()));
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  private async loadMeeting(id: string, quiet = false) {
    clearTimeout(this.timer);
    try {
      const v = await this.api.meeting(id);
      if (this.meetingId() !== id) return;
      this.m.set(v);
      // Sockets push updates; poll slowly as a fallback while the AI is working.
      if (v.status === 'PREPARING' || v.status === 'SUMMARIZING') {
        this.timer = setTimeout(() => void this.loadMeeting(id, true), 4000);
      }
    } catch (e) {
      if (!quiet) this.toast.error(toApiError(e).message);
      if (!quiet) this.open.emit(null);
    }
  }

  async start(kind: 'CHECK_IN' | 'FINAL_REVIEW') {
    this.busy.set(true);
    try {
      const v = await this.api.startMeeting(this.store.slug(), kind);
      this.open.emit(v.id);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async retry() {
    const v = this.m();
    if (!v) return;
    this.busy.set(true);
    try {
      this.m.set(await this.api.retryMeeting(v.id));
      void this.loadMeeting(v.id, true);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  setDraft(position: number, text: string) {
    this.drafts.update((d) => ({ ...d, [position]: text }));
    this.draftVoice.delete(position);
  }

  dirty(position: number, saved: string | null) {
    const d = this.drafts()[position];
    return d !== undefined && d.trim() !== '' && d.trim() !== (saved ?? '');
  }

  async save(position: number): Promise<boolean> {
    const v = this.m();
    const text = (this.drafts()[position] ?? '').trim();
    if (!v || !text) return false;
    this.busy.set(true);
    try {
      this.m.set(await this.api.answerMeeting(v.id, position, text, this.draftVoice.has(position)));
      this.drafts.update((d) => {
        const n = { ...d };
        delete n[position];
        return n;
      });
      return true;
    } catch (e) {
      this.toast.error(toApiError(e).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  /** The AI PM asks each unanswered question aloud and listens; answers save as they come. */
  async voiceMeeting() {
    const qs = this.myQuestions();
    if (!qs) return;
    this.voiceRunning.set(true);
    let silent = 0;
    for (let i = 0; i < qs.length && this.voiceRunning(); i++) {
      const q = this.myQuestions()![i];
      if (q.answer) continue;
      this.active.set(i);
      await this.speech.speak(q.prompt);
      if (!this.voiceRunning()) break;
      const heard = await this.speech.listen({ continuous: true });
      if (!this.voiceRunning() || this.speech.error()) break;
      if (!heard) {
        if (++silent >= 2) break; // nothing heard twice: stop rather than loop
        i--; // ask again
        continue;
      }
      silent = 0;
      this.drafts.update((d) => ({ ...d, [q.position]: heard }));
      this.draftVoice.add(q.position);
      if (!(await this.save(q.position))) break;
    }
    this.voiceRunning.set(false);
  }

  stopVoice() {
    this.voiceRunning.set(false);
    this.speech.stop();
    this.speech.cancelSpeech();
  }

  title(m: MeetingSummary) {
    return m.kind === 'FINAL_REVIEW' ? 'Final review' : `Check-in #${m.number}`;
  }
  statusLabel(s: string) {
    return (
      {
        PREPARING: 'Preparing',
        OPEN: 'Open',
        SUMMARIZING: 'Summarizing',
        CLOSED: 'Done',
        FAILED: 'Needs a retry',
      } as Record<string, string>
    )[s];
  }
  statusClass(s: string) {
    return ({ OPEN: 'info', CLOSED: 'ok', FAILED: 'danger' } as Record<string, string>)[s] ?? 'neutral';
  }
  personLabel(s: string) {
    return ({ PENDING: 'Waiting', ANSWERED: 'Answered', MISSED: 'Missed' } as Record<string, string>)[s];
  }
  personIcon(s: string) {
    return ({ PENDING: 'hourglass_top', ANSWERED: 'check_circle', MISSED: 'event_busy' } as Record<string, string>)[s];
  }
  personClass(s: string) {
    return ({ PENDING: 'neutral', ANSWERED: 'ok', MISSED: 'warn' } as Record<string, string>)[s];
  }
  when(iso: string) {
    const d = new Date(iso);
    const diff = d.getTime() - Date.now();
    const hours = Math.round(diff / 3_600_000);
    if (Math.abs(hours) < 1) return 'within the hour';
    if (hours > 0 && hours < 48) return `in ${hours} h`;
    return d.toLocaleString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  date(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
}
