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
  ASSESSMENT_ANSWER_MAX,
  ASSESSMENT_MIN_LESSONS,
  ASSESSMENT_QUESTION_COUNT,
  type AssessmentView,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { Speech } from '../../core/speech';
import { ToastService } from '../../core/toast.service';
import { SkeletonComponent } from '../../ui/states.component';
import { StudyStore } from './study.store';

/**
 * Voice check (design: "AI BUDDY · QUICK CHECK", spoken). In voice mode the AI reads each
 * question, listens to the answer, saves it and moves on. Typing works throughout. The
 * report appears as soon as it's ready and stays under the course.
 */
@Component({
  selector: 'sb-voice-check',
  imports: [FormsModule, SkeletonComponent],
  providers: [Speech],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="study-scroll narrow">
      @if (!checkId()) {
        <!-- Intro + report history -->
        <div class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI BUDDY · VOICE CHECK</div>
        <h2 class="display" style="font-size:26px;line-height:1.25">Explain what you’ve learnt, out loud.</h2>
        <p class="muted" style="font-size:14px;line-height:1.6">
          {{ count }} spoken questions about the {{ store.doneCount() }} lesson{{ store.doneCount() === 1 ? '' : 's' }}
          you’ve finished. The AI reads each question and listens to your answer; you can also type. You get a report
          straight after, and it stays under this course.
        </p>
        @if (store.doneCount() < minLessons) {
          <div class="banner" style="font-size:12.5px">
            <i class="ms" aria-hidden="true">info</i>Finish at least {{ minLessons }} lessons first, so there’s
            something to ask you about.
          </div>
        }
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
          <button
            type="button"
            class="btn btn-primary"
            [disabled]="busy() || store.doneCount() < minLessons"
            (click)="start()"
          >
            <i class="ms" aria-hidden="true">record_voice_over</i>Start voice check
          </button>
          @if (!speech.canListen) {
            <span class="faint" style="font-size:12px"
              >Voice answers need Chrome, Edge or Safari. You can type here.</span
            >
          }
        </div>

        <span class="section-label" style="margin-top:12px">YOUR REPORTS</span>
        @for (r of store.reports(); track r.id) {
          <button type="button" class="report-row" (click)="open.emit(r.id)">
            <span class="score" [class]="'score ' + band(r.overallScore)">{{ r.overallScore ?? '–' }}</span>
            <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
              <span style="font-size:13.5px;font-weight:600">{{ statusLabel(r.status) }}</span>
              <span class="faint" style="font-size:12px"
                >{{ date(r.createdAt) }} · covered {{ r.lessonsCovered }} lessons</span
              >
            </span>
            <i class="ms" aria-hidden="true" style="margin-left:auto;color:var(--ink-3)">chevron_right</i>
          </button>
        } @empty {
          <span class="faint sm">No voice checks yet.</span>
        }
      } @else if (!a()) {
        <sb-skeleton [rows]="4" [height]="22" />
      } @else {
        @let v = a()!;
        @switch (v.status) {
          @case ('GENERATING') {
            <div class="ai-frame" style="display:flex;align-items:center;gap:10px" aria-live="polite">
              <span class="spinner" aria-hidden="true"></span>Writing {{ count }} questions from the lessons you’ve
              finished…
            </div>
          }
          @case ('EVALUATING') {
            <div class="ai-frame" style="display:flex;align-items:center;gap:10px" aria-live="polite">
              <span class="spinner" aria-hidden="true"></span>Listening back to your answers and writing your report…
            </div>
          }
          @case ('FAILED') {
            <div class="banner danger">
              <i class="ms" aria-hidden="true">sync_problem</i><span class="grow">{{ v.failureMessage }}</span>
              <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="retry()">Retry</button>
              <button type="button" class="btn btn-ghost xs" [disabled]="busy()" (click)="discard()">Discard</button>
            </div>
          }
          @case ('READY') {
            @let q = v.questions[index()];
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI BUDDY · VOICE CHECK</span>
              <span class="mono faint" style="margin-left:auto;font-size:11.5px"
                >QUESTION {{ index() + 1 }} OF {{ v.questions.length }}</span
              >
            </div>
            <div class="qbar" aria-hidden="true">
              @for (x of v.questions; track x.position; let i = $index) {
                <span [class.done]="!!x.answer" [class.cur]="i === index()"></span>
              }
            </div>
            <span class="mono faint" style="font-size:11px"
              >{{ q.lessonLabel ? 'LESSON ' + q.lessonLabel + ' · ' : '' }}{{ q.focus.toUpperCase() }}</span
            >
            <h2 class="display" style="font-size:24px;line-height:1.3">{{ q.prompt }}</h2>

            @if (speech.canSpeak || speech.canListen) {
              <label class="voice-toggle">
                <input type="checkbox" [ngModel]="voiceMode()" (ngModelChange)="setVoiceMode($event)" />
                <span
                  >Voice mode: read each question aloud{{ speech.canListen ? ', then listen for my answer' : '' }}</span
                >
              </label>
            }

            <div class="answer-box" [class.live]="speech.listening()">
              @if (speech.listening()) {
                <div class="voice-live" style="margin:0">
                  <div class="voice-orb listening" aria-hidden="true"><i class="ms">graphic_eq</i></div>
                  <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1" aria-live="polite">
                    <span style="font-size:12.5px;font-weight:600">Listening… take your time</span>
                    <span class="faint" style="font-size:12.5px">{{ speech.heard() || 'Start talking.' }}</span>
                  </div>
                  <button type="button" class="btn btn-primary xs" (click)="speech.stop()">Done answering</button>
                </div>
              } @else if (speech.speaking()) {
                <div class="voice-live" style="margin:0">
                  <div class="voice-orb speaking" aria-hidden="true"><i class="ms">volume_up</i></div>
                  <span style="font-size:12.5px;flex:1">Reading the question…</span>
                  <button type="button" class="btn btn-ghost xs" (click)="speech.cancelSpeech()">Skip</button>
                </div>
              }
              <label class="sr-only" for="ans">Your answer</label>
              <textarea
                id="ans"
                class="input"
                rows="5"
                [ngModel]="draft()"
                (ngModelChange)="draft.set($event)"
                [maxlength]="maxAnswer"
                [disabled]="speech.listening()"
                placeholder="Answer aloud with the mic, or type here."
              ></textarea>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                @if (speech.canListen && !speech.listening()) {
                  <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="answerAloud()">
                    <i class="ms" aria-hidden="true">mic</i>{{ draft() ? 'Add by voice' : 'Answer aloud' }}
                  </button>
                }
                @if (speech.canSpeak && !speech.speaking()) {
                  <button type="button" class="btn btn-ghost" (click)="readQuestion()">
                    <i class="ms" aria-hidden="true">volume_up</i>Read question
                  </button>
                }
                <span class="faint" style="margin-left:auto;font-size:11.5px">{{
                  q.answer ? 'Saved' + (q.viaVoice ? ' · spoken' : '') : 'Not answered yet'
                }}</span>
              </div>
              @if (speech.error(); as err) {
                <span class="field-error">{{ err }}</span>
              }
            </div>

            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
              <button
                type="button"
                class="btn btn-ghost"
                [disabled]="index() === 0 || busy()"
                (click)="go(index() - 1)"
              >
                <i class="ms" aria-hidden="true">arrow_back</i>Previous
              </button>
              @if (index() < v.questions.length - 1) {
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="busy() || speech.listening() || !draft().trim()"
                  (click)="saveAndNext()"
                >
                  Save and next<i class="ms" aria-hidden="true">arrow_forward</i>
                </button>
              } @else {
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="busy() || speech.listening() || !draft().trim()"
                  (click)="finish()"
                >
                  <i class="ms" aria-hidden="true">assignment_turned_in</i>Finish and get my report
                </button>
              }
              <button
                type="button"
                class="btn btn-ghost"
                style="margin-left:auto;color:var(--danger)"
                [disabled]="busy()"
                (click)="discard()"
              >
                Discard check
              </button>
            </div>
            <span class="faint" style="font-size:12px;display:flex;align-items:center;gap:6px"
              ><i class="ms" aria-hidden="true" style="font-size:15px">info</i>Questions are AI-generated from the
              lessons you finished and can be off. Spoken answers are transcribed by your browser; small transcription
              mistakes aren’t held against you.</span
            >
          }
          @case ('EVALUATED') {
            <!-- Report -->
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>VOICE CHECK REPORT</span>
              <span class="faint" style="margin-left:auto;font-size:12px"
                >{{ date(v.evaluatedAt ?? v.createdAt) }} · {{ v.lessonsCovered }} lessons covered</span
              >
            </div>
            <div class="report-hero">
              <span class="score big" [class]="'score big ' + band(v.overallScore)">{{ v.overallScore }}</span>
              <div style="display:flex;flex-direction:column;gap:6px;min-width:0">
                <span style="font-size:15px;font-weight:600">{{ bandLabel(v.overallScore) }}</span>
                <p style="font-size:13.5px;line-height:1.6;color:var(--ink-2)">{{ v.summary }}</p>
              </div>
            </div>
            <div class="report-grid">
              <div class="ws-card">
                <span class="ws-card-title">What you explained well</span>
                @for (s of v.strengths; track s) {
                  <span class="sm"><i class="ms ok-ic" aria-hidden="true">check_circle</i> {{ s }}</span>
                } @empty {
                  <span class="faint sm">Nothing stood out yet.</span>
                }
              </div>
              <div class="ws-card">
                <span class="ws-card-title">Worth another look</span>
                @for (g of v.gaps; track g) {
                  <span class="sm"><i class="ms warn-ic" aria-hidden="true">error</i> {{ g }}</span>
                } @empty {
                  <span class="faint sm">No gaps found.</span>
                }
                @if (v.reviewLessons.length) {
                  <div class="chips" style="margin-top:4px">
                    @for (label of v.reviewLessons; track label) {
                      <button type="button" class="ctx-chip" (click)="review.emit(label)">
                        <i class="ms" aria-hidden="true">replay</i>Revisit {{ label }}
                      </button>
                    }
                  </div>
                }
              </div>
            </div>
            @for (x of v.questions; track x.position) {
              <div class="report-q">
                <div style="display:flex;gap:10px;align-items:baseline">
                  <span class="mono faint" style="font-size:11px"
                    >Q{{ x.position }}{{ x.lessonLabel ? ' · ' + x.lessonLabel : '' }}</span
                  >
                  <span style="font-size:14px;font-weight:600;flex:1">{{ x.prompt }}</span>
                  <span class="mono" [class]="'mono qscore ' + band((x.score ?? 0) * 10)">{{ x.score }}/10</span>
                </div>
                <div class="report-ans">
                  <span class="k">{{ x.viaVoice ? 'YOU SAID' : 'YOU WROTE' }}</span
                  >{{ x.answer }}
                </div>
                <p class="sm" style="line-height:1.55">{{ x.feedback }}</p>
                <details>
                  <summary class="sm" style="cursor:pointer;color:var(--ai)">A strong answer</summary>
                  <p class="sm muted" style="line-height:1.55;margin-top:6px">{{ x.modelAnswer }}</p>
                </details>
              </div>
            }
            <div style="display:flex;gap:8px;flex-wrap:wrap">
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="start()">
                <i class="ms" aria-hidden="true">record_voice_over</i>Take another check
              </button>
              <button type="button" class="btn btn-ghost" (click)="open.emit(null)">All reports</button>
            </div>
          }
        }
      }
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class VoiceCheckComponent {
  readonly store = inject(StudyStore);
  readonly speech = inject(Speech);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  /** The open check (from the URL), or null for the intro and report list. */
  readonly checkId = input<string | null>(null);
  readonly open = output<string | null>();
  readonly review = output<string>();

  readonly a = signal<AssessmentView | null>(null);
  readonly index = signal(0);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly voiceMode = signal(this.speech.canSpeak);
  readonly count = ASSESSMENT_QUESTION_COUNT;
  readonly minLessons = ASSESSMENT_MIN_LESSONS;
  readonly maxAnswer = ASSESSMENT_ANSWER_MAX;
  private draftVoice = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly status = computed(() => this.a()?.status);

  constructor() {
    effect(() => {
      const id = this.checkId();
      untracked(() => {
        this.a.set(null);
        this.speech.stop();
        this.speech.cancelSpeech();
        if (id) void this.load(id, true);
      });
    });
    // Entering READY (questions arrived): start the voice flow on the first open question.
    effect(() => {
      if (this.status() !== 'READY') return;
      untracked(() => void this.enterQuestion());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private async load(id: string, jumpToFirstOpen = false) {
    clearTimeout(this.timer);
    try {
      const v = await this.api.assessment(id);
      if (v.id !== this.checkId()) return;
      if (jumpToFirstOpen || this.a()?.status !== v.status) {
        const first = v.questions.findIndex((q) => !q.answer);
        this.index.set(first < 0 ? Math.max(0, v.questions.length - 1) : first);
        this.draft.set(v.questions[this.index()]?.answer ?? '');
      }
      this.a.set(v);
      if (v.status === 'GENERATING' || v.status === 'EVALUATING') {
        this.timer = setTimeout(() => void this.load(id), 1500);
      } else if (v.status === 'EVALUATED') {
        void this.store.refreshReports();
      }
    } catch (e) {
      this.toast.error(toApiError(e).message);
      this.open.emit(null);
    }
  }

  setVoiceMode(on: boolean) {
    this.voiceMode.set(on);
    if (!on) {
      this.speech.stop();
      this.speech.cancelSpeech();
    } else void this.enterQuestion();
  }

  /** Voice mode: read the question, then listen (only when the question has no answer yet). */
  private async enterQuestion() {
    if (!this.voiceMode() || this.status() !== 'READY') return;
    const q = this.a()?.questions[this.index()];
    if (!q) return;
    const at = this.index();
    await this.speech.speak(q.prompt);
    if (this.index() !== at || !this.voiceMode() || this.status() !== 'READY') return;
    if (!q.answer && !this.draft().trim() && this.speech.canListen) await this.answerAloud();
  }

  readQuestion() {
    const q = this.a()?.questions[this.index()];
    if (q) void this.speech.speak(q.prompt);
  }

  async answerAloud() {
    const at = this.index();
    const heard = await this.speech.listen({ continuous: true });
    if (!heard || this.index() !== at) return;
    this.draft.update((d) => (d.trim() ? `${d.trim()} ${heard}` : heard));
    this.draftVoice = true;
    // In voice mode a spoken answer moves straight on, like a conversation.
    if (this.voiceMode()) {
      if (this.index() < (this.a()?.questions.length ?? 0) - 1) await this.saveAndNext();
      else this.toast.ok('Last answer captured. Review it, then finish to get your report.');
    }
  }

  async go(i: number) {
    const v = this.a();
    if (!v || i < 0 || i >= v.questions.length) return;
    this.speech.stop();
    this.speech.cancelSpeech();
    this.index.set(i);
    this.draft.set(v.questions[i].answer ?? '');
    this.draftVoice = v.questions[i].viaVoice;
    void this.enterQuestion();
  }

  private async save(): Promise<boolean> {
    const v = this.a();
    const text = this.draft().trim();
    if (!v || !text) return false;
    const q = v.questions[this.index()];
    if (q.answer === text) return true;
    this.busy.set(true);
    try {
      this.a.set(await this.api.answerAssessment(v.id, q.position, text, this.draftVoice));
      return true;
    } catch (e) {
      this.toast.error(toApiError(e).message);
      return false;
    } finally {
      this.busy.set(false);
    }
  }

  async saveAndNext() {
    if (await this.save()) await this.go(this.index() + 1);
  }

  async finish() {
    const v = this.a();
    if (!v || !(await this.save())) return;
    this.busy.set(true);
    try {
      this.a.set(await this.api.submitAssessment(v.id));
      void this.load(v.id);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async start() {
    const e = this.store.enrollment();
    if (!e) return;
    this.busy.set(true);
    try {
      const v = await this.api.startAssessment(e.id);
      this.open.emit(v.id);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  async retry() {
    const v = this.a();
    if (!v) return;
    this.busy.set(true);
    try {
      this.a.set(await this.api.retryAssessment(v.id));
      void this.load(v.id);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async discard() {
    const v = this.a();
    if (!v || !confirm('Discard this voice check? Your answers to it will be deleted.')) return;
    this.busy.set(true);
    try {
      await this.api.discardAssessment(v.id);
      await this.store.refreshReports();
      this.open.emit(null);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  band(score: number | null) {
    if (score === null) return 'none';
    return score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
  }
  bandLabel(score: number | null) {
    return { high: 'You explain this well', mid: 'Solid start, a few gaps', low: 'Worth revisiting', none: '' }[
      this.band(score)
    ];
  }
  statusLabel(s: string) {
    return (
      {
        EVALUATED: 'Report',
        READY: 'In progress',
        GENERATING: 'Preparing',
        EVALUATING: 'Writing report',
        FAILED: 'Needs a retry',
      } as Record<string, string>
    )[s];
  }
  date(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
