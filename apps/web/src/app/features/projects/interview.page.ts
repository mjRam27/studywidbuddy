import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  NgZone,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ANSWER_MAX_SEC,
  ANSWER_START_LIMIT_SEC,
  INTERVIEW_PASS_SCORE,
  type InterviewTurnView,
  type InterviewView,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { Speech } from '../../core/speech';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

type Phase = 'idle' | 'speaking' | 'listening' | 'sending' | 'closing' | 'mic-error';

const SILENCE_MS = 4000;

/**
 * Live AI voice interview. The interviewer speaks (browser text-to-speech), the candidate
 * answers out loud (browser speech recognition) and the server decides the next question.
 * There is no text box: answers can only come from the microphone. Tab switches are counted
 * and shown to reviewers.
 */
@Component({
  selector: 'sb-interview-page',
  imports: [RouterLink, TopbarComponent, ErrorStateComponent, SkeletonComponent],
  providers: [Speech],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/projects">Projects</a><i class="ms" aria-hidden="true">chevron_right</i>
        <a [routerLink]="['/applications', id()]">Application</a><i class="ms" aria-hidden="true">chevron_right</i>
        <b>Voice interview</b>
      </nav>
    </sb-topbar>
    <div class="page narrow" style="max-width:900px">
      @if (error()) {
        <sb-error-state [error]="error()" title="The interview didn’t load" (retry)="load()" />
      } @else if (!iv()) {
        <sb-skeleton [rows]="6" [height]="22" />
      } @else {
        @let v = iv()!;
        <div class="page-head-text">
          <span class="eyebrow">{{ v.role.title.toUpperCase() }} · {{ v.project.title.toUpperCase() }}</span>
          <h1>AI voice interview</h1>
        </div>

        @switch (v.status) {
          @case ('LIVE') {
            @if (!inCall()) {
              <!-- Reload / rejoin: speech needs a click before the browser lets us talk and listen. -->
              <section class="panel pad-lg">
                <span class="panel-title">Your interview is in progress</span>
                <span class="muted sm">Rejoin to hear the current question again and carry on.</span>
                <button type="button" class="btn btn-primary" style="align-self:flex-start" (click)="enterCall()">
                  <i class="ms" aria-hidden="true">call</i>Rejoin the call
                </button>
              </section>
            } @else {
              <section class="call" aria-label="Interview call">
                <div class="call-head">
                  <span class="rec-dot" aria-hidden="true"></span>
                  <span class="mono" style="font-size:12px">{{ clock() }}</span>
                  <span class="faint" style="font-size:12px">Question {{ current()?.position ?? 1 }}</span>
                  @if (focusLostTotal()) {
                    <span class="call-warn" title="Leaving this tab is noted for the reviewers"
                      ><i class="ms" aria-hidden="true">tab_unselected</i>Left the tab {{ focusLostTotal() }}×</span
                    >
                  }
                </div>
                <div class="call-stage">
                  <div class="call-orb" [class]="'call-orb ' + phase()" aria-hidden="true">
                    <span class="ai-diamond"></span>
                  </div>
                  <span class="call-state" aria-live="polite">{{ phaseLabel() }}</span>
                  @if (current(); as q) {
                    <p class="call-caption">{{ q.prompt }}</p>
                  } @else if (closing()) {
                    <p class="call-caption">{{ closing() }}</p>
                  }
                  @if (phase() === 'listening') {
                    <div class="call-heard" aria-live="polite">
                      @if (speech.heard()) {
                        {{ speech.heard() }}
                      } @else {
                        <span class="faint">Start speaking whenever you’re ready ({{ startLeft() }}s)…</span>
                      }
                    </div>
                  }
                  @if (phase() === 'mic-error') {
                    <div class="banner warn" style="font-size:12.5px">
                      <i class="ms" aria-hidden="true">mic_off</i>{{ speech.error() }}
                    </div>
                  }
                </div>
                <div class="call-controls">
                  @if (phase() === 'listening') {
                    <button type="button" class="btn btn-primary lg" (click)="speech.stop()">
                      <i class="ms" aria-hidden="true">check</i>Done answering
                    </button>
                  }
                  @if (phase() === 'listening' || phase() === 'mic-error') {
                    <button type="button" class="btn btn-ghost" (click)="repeat()">
                      <i class="ms" aria-hidden="true">replay</i>Repeat the question
                    </button>
                  }
                  @if (phase() === 'mic-error') {
                    <button type="button" class="btn btn-secondary" (click)="ask()">
                      <i class="ms" aria-hidden="true">mic</i>Try the microphone again
                    </button>
                  }
                </div>
                <span class="faint" style="font-size:11.5px;text-align:center"
                  >Speak naturally; a pause of a few seconds ends your answer. You can’t type answers.</span
                >
              </section>
            }
          }
          @case ('SCHEDULED') {
            @if (v.canJoin) {
              <section class="panel pad-lg precall" aria-labelledby="pre-h">
                <span class="panel-title" id="pre-h">Before you join</span>
                @if (!speech.canListen || !speech.canSpeak) {
                  <div class="banner danger">
                    <i class="ms" aria-hidden="true">block</i>This browser can’t run voice interviews. Open this page in
                    Chrome or Edge on a computer with a microphone.
                  </div>
                } @else {
                  <ul class="precall-rules">
                    <li><i class="ms" aria-hidden="true">mic</i>Answers are spoken, not typed. Find a quiet place.</li>
                    <li>
                      <i class="ms" aria-hidden="true">timer</i>Start each answer within {{ startLimit }}s; you can talk
                      for up to {{ maxAnswerMin }} minutes. A pause of a few seconds ends your answer.
                    </li>
                    <li>
                      <i class="ms" aria-hidden="true">tab</i>Stay on this tab: leaving it is noted for the reviewers.
                    </li>
                    <li>
                      <i class="ms" aria-hidden="true">schedule</i>About 15 minutes: an introduction and a few
                      questions.
                    </li>
                  </ul>
                  <div class="mic-test">
                    <button type="button" class="btn btn-secondary" [disabled]="testing()" (click)="micTest()">
                      <i class="ms" aria-hidden="true">graphic_eq</i
                      >{{ testing() ? 'Listening… say something' : 'Test my microphone' }}
                    </button>
                    <span class="sm" [class.faint]="!micOk()">{{
                      micOk()
                        ? '✓ We heard: “' + micHeard() + '”'
                        : (speech.error() ?? 'Say a sentence to check we can hear you.')
                    }}</span>
                  </div>
                  <button
                    type="button"
                    class="btn btn-primary lg"
                    style="align-self:flex-start"
                    [disabled]="joining() || !micOk()"
                    (click)="join()"
                  >
                    @if (joining()) {
                      <span class="spinner" aria-hidden="true"></span>Preparing your interviewer…
                    } @else {
                      <i class="ms" aria-hidden="true">call</i>Join the interview
                    }
                  </button>
                }
              </section>
            } @else {
              <section class="panel pad-lg">
                <span class="panel-title">Not open yet</span>
                <span class="muted sm"
                  >Your interview is booked for {{ fmt(v.scheduledFor) }}. You can join from 10 minutes before. If you
                  missed it, book a new time from your application.</span
                >
                <a
                  class="btn btn-secondary"
                  style="align-self:flex-start"
                  [routerLink]="['/applications', v.applicationId]"
                  >Back to application</a
                >
              </section>
            }
          }
          @case ('AWAITING_SCHEDULE') {
            <section class="panel pad-lg">
              <span class="panel-title">Book your interview first</span>
              <a class="btn btn-primary" style="align-self:flex-start" [routerLink]="['/applications', v.applicationId]"
                >Choose “Start now” or a time</a
              >
            </section>
          }
          @case ('SUBMITTED') {
            <section class="ai-frame" style="display:flex;gap:10px;align-items:center" aria-live="polite">
              <span class="spinner" aria-hidden="true"></span>
              <span>{{ closing() ?? 'Thanks!' }} Your evaluation is being written; this page updates by itself.</span>
            </section>
          }
          @case ('FAILED') {
            <div class="banner danger">
              <i class="ms" aria-hidden="true">sync_problem</i><span class="grow">{{ v.failureMessage }}</span>
              <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="retry()">Retry</button>
            </div>
          }
          @case ('EVALUATED') {
            @let e = v.evaluation!;
            <section class="panel pad-lg">
              <div class="ats">
                <div class="ats-score" [class.pass]="e.overallScore >= passMark">
                  <span class="n">{{ e.overallScore }}</span
                  ><span class="of">/100</span>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  <span class="panel-title">{{
                    e.overallScore >= passMark
                      ? 'You passed the interview'
                      : 'Below the ' + passMark + ' needed for a seat'
                  }}</span>
                  <span class="muted sm">{{ e.summary }}</span>
                </div>
              </div>
              <div class="ats-bars">
                @for (b of bars(); track b.label) {
                  <div class="ats-bar">
                    <span class="l">{{ b.label }}</span>
                    <span class="track"><span [style.width.%]="b.score"></span></span>
                    <span class="mono v">{{ b.score }}</span>
                  </div>
                }
              </div>
              <div class="report-grid">
                <div>
                  <span class="section-label">STRENGTHS</span>
                  @for (s of e.strengths; track s) {
                    <p class="sm">
                      <i class="ms ok-ic" aria-hidden="true" style="font-size:15px;vertical-align:-3px">check_circle</i>
                      {{ s }}
                    </p>
                  }
                </div>
                <div>
                  <span class="section-label">TO IMPROVE</span>
                  @for (s of e.areasToImprove; track s) {
                    <p class="sm">
                      <i class="ms warn-ic" aria-hidden="true" style="font-size:15px;vertical-align:-3px"
                        >trending_up</i
                      >
                      {{ s }}
                    </p>
                  }
                </div>
              </div>
              <a class="btn btn-primary" style="align-self:flex-start" [routerLink]="['/applications', v.applicationId]"
                >See your result and next steps</a
              >
            </section>
          }
        }

        @if (v.turns.length && v.status !== 'LIVE') {
          <section class="panel pad-lg">
            <span class="panel-title">Transcript</span>
            @for (t of v.turns; track t.position) {
              <div class="turn">
                <span class="who"><span class="ai-diamond" aria-hidden="true"></span>Interviewer</span>
                <p>{{ t.prompt }}</p>
                <span class="who you">You (transcribed)</span>
                <p>{{ t.answer }}</p>
              </div>
            }
          </section>
        }
      }
    </div>
  `,
})
export class InterviewPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  readonly speech = inject(Speech);

  /** The application id (route: applications/:id/interview). */
  readonly id = input.required<string>();
  readonly iv = signal<InterviewView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly joining = signal(false);
  readonly inCall = signal(false);
  readonly phase = signal<Phase>('idle');
  readonly current = signal<InterviewTurnView | null>(null);
  readonly closing = signal<string | null>(null);
  readonly testing = signal(false);
  readonly micOk = signal(false);
  readonly micHeard = signal('');
  readonly focusLostTotal = signal(0);
  readonly now = signal(Date.now());
  readonly startLimit = ANSWER_START_LIMIT_SEC;
  readonly maxAnswerMin = Math.round(ANSWER_MAX_SEC / 60);
  readonly passMark = INTERVIEW_PASS_SCORE;

  private focusLostSinceTurn = 0;
  private repeating = false;
  private listenStartedAt = 0;
  private questionEndedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private ticker: ReturnType<typeof setInterval> | undefined;

  readonly clock = computed(() => {
    const started = this.iv()?.startedAt ? new Date(this.iv()!.startedAt!).getTime() : this.now();
    const s = Math.max(0, Math.floor((this.now() - started) / 1000));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  readonly startLeft = computed(() =>
    Math.max(0, ANSWER_START_LIMIT_SEC - Math.floor((this.now() - this.listenStartedAt) / 1000)),
  );
  readonly phaseLabel = computed(
    () =>
      ({
        idle: 'Connecting…',
        speaking: 'The interviewer is speaking',
        listening: 'Your turn: listening',
        sending: 'Thinking…',
        closing: 'Wrapping up',
        'mic-error': 'We can’t hear you',
      })[this.phase()],
  );
  readonly bars = computed(() => {
    const e = this.iv()?.evaluation;
    return e
      ? [
          { label: 'Technical', score: e.technicalScore },
          { label: 'Problem solving', score: e.problemSolvingScore },
          { label: 'Communication', score: e.communicationScore },
          { label: 'Project fit', score: e.projectFitScore },
        ]
      : [];
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
    const onVisibility = () => {
      if (document.hidden && this.inCall()) {
        this.focusLostSinceTurn++;
        this.focusLostTotal.update((n) => n + 1);
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    // Outside the zone so the clock doesn't keep the app "busy"; signals still update the view.
    inject(NgZone).runOutsideAngular(() => {
      this.ticker = setInterval(() => this.now.set(Date.now()), 1000);
    });
    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', onVisibility);
      clearTimeout(this.timer);
      clearInterval(this.ticker);
      this.speech.stop();
      this.speech.cancelSpeech();
    });
  }

  async load() {
    clearTimeout(this.timer);
    this.error.set(null);
    try {
      const v = await this.api.interviewForApplication(this.id());
      this.iv.set(v);
      if (v.closingRemark) this.closing.set(v.closingRemark);
      if (v.status === 'SUBMITTED') this.timer = setTimeout(() => void this.load(), 2500);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  async micTest() {
    this.testing.set(true);
    const heard = await this.speech.listen({ continuous: false, startTimeoutMs: 8000, maxMs: 10_000 });
    this.testing.set(false);
    this.micHeard.set(heard);
    this.micOk.set(heard.trim().length > 0);
  }

  async join() {
    const v = this.iv();
    if (!v) return;
    this.joining.set(true);
    try {
      const live = await this.api.startInterview(v.id);
      this.iv.set(live);
      this.enterCall();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.joining.set(false);
    }
  }

  /** Starts (or resumes) the call loop from the current question. */
  enterCall() {
    const v = this.iv();
    if (!v?.current) return;
    this.inCall.set(true);
    this.current.set(v.current);
    void this.ask();
  }

  /** Stop listening without sending, read the question again, and listen afresh. */
  repeat() {
    if (this.phase() === 'listening') {
      this.repeating = true;
      this.speech.stop();
    } else {
      void this.ask();
    }
  }

  /** Read the current question aloud, then listen for the answer and send it. */
  async ask(): Promise<void> {
    const q = this.current();
    if (!q) return;
    this.phase.set('speaking');
    await this.speech.speak(q.prompt);
    if (this.current() !== q) return;
    this.questionEndedAt = Date.now();
    this.listenStartedAt = Date.now();
    this.phase.set('listening');
    const answer = await this.speech.listen({
      continuous: true,
      silenceMs: SILENCE_MS,
      startTimeoutMs: ANSWER_START_LIMIT_SEC * 1000,
      maxMs: ANSWER_MAX_SEC * 1000,
    });
    if (this.current() !== q || this.phase() !== 'listening') return;
    if (this.repeating) {
      this.repeating = false;
      return this.ask();
    }
    if (this.speech.error()) {
      this.phase.set('mic-error');
      return;
    }
    await this.send(q, answer);
  }

  private async send(q: InterviewTurnView, answer: string) {
    const v = this.iv()!;
    this.phase.set('sending');
    const first = this.speech.firstSpeechAt;
    try {
      const r = await this.api.interviewTurn(v.id, {
        position: q.position,
        answer: answer.trim(),
        thinkMs: first ? Math.max(0, first - this.questionEndedAt) : undefined,
        speakMs: first ? Math.max(0, Date.now() - first) : undefined,
        focusLost: this.focusLostSinceTurn || undefined,
      });
      this.focusLostSinceTurn = 0;
      if (r.done) {
        this.current.set(null);
        this.closing.set(r.closingRemark);
        this.phase.set('closing');
        await this.speech.speak(r.closingRemark ?? 'Thank you.');
        this.inCall.set(false);
        await this.load();
        return;
      }
      this.current.set(r.next);
      await this.ask();
    } catch (e) {
      const err = toApiError(e);
      this.toast.error(err.message);
      // The answer may already be recorded (e.g. a double send): reload and resume from the server.
      await this.load();
      if (this.iv()?.status === 'LIVE') this.enterCall();
    }
  }

  async retry() {
    const v = this.iv();
    if (!v) return;
    this.busy.set(true);
    try {
      this.iv.set(await this.api.retryInterview(v.id));
      void this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  fmt(iso: string | null) {
    return iso
      ? new Date(iso).toLocaleString(undefined, {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : '';
  }
}
