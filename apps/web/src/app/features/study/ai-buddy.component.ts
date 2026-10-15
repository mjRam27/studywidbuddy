import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  inject,
  type OnInit,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ErrorCode, TUTOR_MESSAGE_MAX, type TutorMessageView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { Speech } from '../../core/speech';
import { StudyStore } from './study.store';
import { fmtTime } from './youtube-bridge';

type VoicePhase = 'off' | 'listening' | 'thinking' | 'speaking';

const QUICK = [
  'What did they just explain?',
  'Explain it simply',
  'Give me an example',
  'Quiz me on this lesson',
  'What should I review next?',
];

/**
 * AI Buddy side panel (design: "AI BUDDY · hint-first"). Typed chat, one-shot dictation, and a
 * hands-free voice conversation: listen → answer (fast model, short spoken reply) → speak →
 * listen again, until the learner ends it.
 */
@Component({
  selector: 'sb-ai-buddy',
  imports: [FormsModule],
  providers: [Speech],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="buddy-head">
      <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI BUDDY</span>
      <span class="faint" style="font-size:11.5px">hint-first</span>
      <button
        type="button"
        class="icon-btn"
        style="margin-left:auto"
        title="Collapse AI Buddy"
        (click)="collapse.emit()"
      >
        <i class="ms" aria-hidden="true">right_panel_close</i>
      </button>
    </div>
    <div class="buddy-ctx">
      <span style="font-size:12.5px">Ask anything about this course. Talk or type.</span>
      <div class="buddy-using">
        <i class="ms" aria-hidden="true">my_location</i>Using
        <span class="ctx-chip">{{ store.course()?.title }}</span>
        @if (store.lesson(); as l) {
          <span class="ctx-chip">Lesson {{ l.label }}</span>
          @if (atSec(); as at) {
            <span class="ctx-chip" title="Your position in the lesson video"
              ><i class="ms" aria-hidden="true">play_circle</i>Video at {{ fmt(at) }}</span
            >
          }
          @if (l.youtubeId) {
            <span
              class="ctx-chip"
              [title]="l.transcript ? 'The AI reads what is said in the video' : 'No transcript yet'"
              ><i class="ms" aria-hidden="true">{{ l.transcript ? 'subtitles' : 'subtitles_off' }}</i
              >{{ l.transcript ? 'Transcript' : 'No transcript' }}</span
            >
          }
          @if (l.note) {
            <span class="ctx-chip">Your note</span>
          }
        }
      </div>
    </div>

    <div class="buddy-thread" #thread aria-live="polite">
      @if (aiOff()) {
        <div class="banner warn" style="font-size:12.5px">
          <i class="ms" aria-hidden="true">cloud_off</i>The AI Buddy isn’t available on this server yet.
        </div>
      }
      @for (m of messages(); track m.id) {
        @if (m.role === 'USER') {
          <div class="buddy-me">
            @if (m.atSec !== null) {
              <button
                type="button"
                class="buddy-at"
                [title]="'Play the video from ' + fmt(m.atSec)"
                (click)="store.seek(m.atSec)"
              >
                <i class="ms" aria-hidden="true">play_arrow</i>{{ fmt(m.atSec) }}
              </button>
            }
            @if (m.viaVoice) {
              <i class="ms" aria-hidden="true" style="font-size:13px;vertical-align:-2px;color:var(--ink-3)">mic</i>
            }
            {{ m.content }}
          </div>
        } @else {
          <div class="buddy-ai">
            <span class="k">{{ m.lessonLabel ? 'LESSON ' + m.lessonLabel : 'COURSE' }}</span>
            <span class="t">{{ m.content }}</span>
            @if (speech.canSpeak) {
              <button type="button" class="buddy-replay" (click)="speak(m.content)">
                <i class="ms" aria-hidden="true">volume_up</i>Read aloud
              </button>
            }
          </div>
        }
      } @empty {
        @if (!aiOff()) {
          <span class="faint" style="font-size:12.5px"
            >No questions yet. Try “Explain this lesson simply”, or press the mic and just ask.</span
          >
        }
      }
      @if (thinking()) {
        <div class="buddy-thinking">
          <span class="spinner" aria-hidden="true"></span>Reading
          {{ store.lesson() ? 'lesson ' + store.lesson()!.label : 'the course' }}…
        </div>
      }
    </div>

    @if (phase() !== 'off') {
      <div class="voice-live" role="status">
        <div class="voice-orb" [class]="'voice-orb ' + phase()" aria-hidden="true">
          <i class="ms">{{ phaseIcon() }}</i>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">
          <span style="font-size:12.5px;font-weight:600">{{ phaseLabel() }}</span>
          <span class="faint ellipsis" style="font-size:12px">{{
            speech.heard() || 'Ask your question, then pause.'
          }}</span>
        </div>
        <button type="button" class="btn btn-secondary xs" (click)="endVoice()">End</button>
      </div>
    }
    @if (speech.error(); as err) {
      <div class="banner warn" style="margin:0 14px;font-size:12px">
        <i class="ms" aria-hidden="true">mic_off</i>{{ err }}
      </div>
    }

    <div class="buddy-input">
      <div class="buddy-quick">
        @for (q of quick; track q) {
          <button type="button" [disabled]="busy() || aiOff()" (click)="send(q)">{{ q }}</button>
        }
      </div>
      <form class="buddy-box" (ngSubmit)="send(draft)">
        <label class="sr-only" for="buddy-q">Ask the AI Buddy</label>
        <textarea
          id="buddy-q"
          name="q"
          rows="1"
          [(ngModel)]="draft"
          [maxlength]="max"
          [disabled]="aiOff()"
          placeholder="Ask about this lesson…"
          (keydown.enter)="enter($event)"
        ></textarea>
        @if (speech.canListen) {
          <button
            type="button"
            class="icon-btn"
            [class.live]="phase() !== 'off'"
            [disabled]="aiOff() || busy()"
            [title]="phase() === 'off' ? 'Talk to the AI Buddy (voice conversation)' : 'End voice conversation'"
            [attr.aria-pressed]="phase() !== 'off'"
            (click)="phase() === 'off' ? startVoice() : endVoice()"
          >
            <i class="ms" aria-hidden="true">{{ phase() === 'off' ? 'mic' : 'mic_off' }}</i>
          </button>
        }
        <button type="submit" class="icon-btn send" [disabled]="busy() || aiOff() || !draft.trim()" title="Send">
          <i class="ms" aria-hidden="true">arrow_upward</i>
        </button>
      </form>
      @if (!speech.canListen) {
        <span class="faint" style="font-size:11px"
          >Voice input needs Chrome, Edge or Safari. Typing works everywhere.</span
        >
      }
    </div>
  `,
  styles: [':host{display:flex;flex-direction:column;min-height:0;height:100%}'],
})
export class AiBuddyComponent implements OnInit {
  readonly store = inject(StudyStore);
  readonly speech = inject(Speech);
  private readonly api = inject(Api);

  readonly collapse = output<void>();
  readonly messages = signal<TutorMessageView[]>([]);
  readonly thinking = signal(false);
  readonly busy = signal(false);
  readonly aiOff = signal(false);
  readonly phase = signal<VoicePhase>('off');
  readonly quick = QUICK;
  readonly max = TUTOR_MESSAGE_MAX;
  readonly fmt = fmtTime;
  /** Video position to send with a question; only when the open lesson has a video playing. */
  atSec() {
    return this.store.lesson()?.youtubeId ? this.store.videoSec() : null;
  }
  draft = '';
  private readonly thread = viewChild<ElementRef<HTMLElement>>('thread');

  constructor() {
    // Prompts sent from elsewhere in the workspace ("Ask AI about this lesson").
    effect(() => {
      const p = this.store.buddyPrompt();
      if (!p) return;
      untracked(() => {
        this.store.buddyPrompt.set(null);
        void this.send(p);
      });
    });
  }

  async ngOnInit() {
    const [status, history] = await Promise.all([
      this.api.aiStatus().catch(() => null),
      this.store.enrollment() ? this.api.tutorHistory(this.store.enrollment()!.id).catch(() => []) : [],
    ]);
    this.aiOff.set(status?.configured === false);
    this.messages.set(history);
    this.scroll();
  }

  phaseIcon() {
    return { off: 'mic', listening: 'graphic_eq', thinking: 'more_horiz', speaking: 'volume_up' }[this.phase()];
  }
  phaseLabel() {
    return {
      off: '',
      listening: 'Listening…',
      thinking: 'Thinking…',
      speaking: 'Speaking… (talk after it finishes)',
    }[this.phase()];
  }

  enter(e: Event) {
    const k = e as KeyboardEvent;
    if (k.shiftKey) return;
    k.preventDefault();
    void this.send(this.draft);
  }

  /** One question → one answer. Returns the answer text (or null on failure). */
  async send(text: string, viaVoice = false): Promise<string | null> {
    const q = text.trim();
    const e = this.store.enrollment();
    if (!q || !e || this.busy()) return null;
    this.busy.set(true);
    this.thinking.set(true);
    if (!viaVoice) this.draft = '';
    const tempId = `tmp-${Date.now()}`;
    const atSec = this.atSec();
    this.messages.update((m) => [
      ...m,
      {
        id: tempId,
        role: 'USER',
        content: q,
        viaVoice,
        lessonLabel: this.store.lesson()?.label ?? null,
        atSec,
        createdAt: new Date().toISOString(),
      },
    ]);
    this.scroll();
    try {
      const res = await this.api.askTutor(e.id, {
        message: q,
        lessonId: this.store.lesson()?.id,
        viaVoice,
        ...(atSec !== null ? { atSec } : {}),
      });
      this.messages.update((m) => [...m.filter((x) => x.id !== tempId), res.question, res.answer]);
      return res.answer.content;
    } catch (err) {
      const apiErr = toApiError(err);
      if (apiErr.code === ErrorCode.AI_NOT_CONFIGURED) this.aiOff.set(true);
      this.messages.update((m) => [
        ...m,
        {
          id: `err-${Date.now()}`,
          role: 'ASSISTANT',
          content: apiErr.message,
          viaVoice: false,
          lessonLabel: null,
          atSec: null,
          createdAt: new Date().toISOString(),
        },
      ]);
      return null;
    } finally {
      this.busy.set(false);
      this.thinking.set(false);
      this.scroll();
    }
  }

  async startVoice() {
    this.phase.set('listening');
    let silent = 0;
    while (this.phase() !== 'off') {
      this.phase.set('listening');
      const heard = await this.speech.listen({ continuous: false });
      if (this.phase() === 'off') break;
      if (this.speech.error()) break;
      if (!heard) {
        // Silence: keep listening a little, then stop rather than holding the mic open forever.
        if (++silent >= 3) break;
        continue;
      }
      silent = 0;
      this.phase.set('thinking');
      const answer = await this.send(heard, true);
      if (this.phase() === 'off' || answer === null) break;
      this.phase.set('speaking');
      await this.speech.speak(answer);
    }
    this.phase.set('off');
  }

  endVoice() {
    this.phase.set('off');
    this.speech.stop();
    this.speech.cancelSpeech();
  }

  speak(text: string) {
    void this.speech.speak(text);
  }

  private scroll() {
    queueMicrotask(() => {
      const el = this.thread()?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }
}
