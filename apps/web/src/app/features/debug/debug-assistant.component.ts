import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  inject,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DebugExerciseStore } from './debug-exercise.store';
import { parseReply } from './reply-format';

const QUICK = ['Explain this file to me', 'How do these files connect?', 'Explain the failing test', 'Give me a hint'];

/**
 * The AI Debug coach (Gemini). Explains code, breaks it down and maps how files connect.
 * Hint-only by default; the Solution toggle lets it explain the exact fixes. It never edits
 * the learner's files.
 */
@Component({
  selector: 'sb-debug-assistant',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="dbg-thread" #thread aria-live="polite">
      @for (m of rendered(); track $index) {
        @if (m.role === 'user') {
          <div class="buddy-me">{{ m.text }}</div>
        } @else {
          <div class="ai-frame dbg-reply">
            @for (b of m.blocks; track $index) {
              @switch (b.kind) {
                @case ('code') {
                  <pre class="dbg-code"><code>{{ b.text }}</code></pre>
                }
                @case ('list') {
                  <ul>
                    @for (item of b.items; track $index) {
                      <li>
                        @for (p of item; track $index) {
                          @if (p.kind === 'code') {
                            <code>{{ p.text }}</code>
                          } @else if (p.kind === 'bold') {
                            <b>{{ p.text }}</b>
                          } @else {
                            {{ p.text }}
                          }
                        }
                      </li>
                    }
                  </ul>
                }
                @default {
                  <p>
                    @for (p of b.parts; track $index) {
                      @if (p.kind === 'code') {
                        <code>{{ p.text }}</code>
                      } @else if (p.kind === 'bold') {
                        <b>{{ p.text }}</b>
                      } @else {
                        {{ p.text }}
                      }
                    }
                  </p>
                }
              }
            }
          </div>
        }
      } @empty {
        <p class="faint sm" style="margin:0">
          Ask about any line or file. The coach explains what the code does, how the files connect and what a failing
          test means, without fixing it for you.
        </p>
      }
      @if (store.asking()) {
        <div class="ai-frame dbg-reply faint"><span class="spinner" aria-hidden="true"></span> Thinking…</div>
      }
    </div>

    <div class="dbg-quick">
      @for (q of quick; track q) {
        <button type="button" class="chip-btn" [disabled]="store.asking()" (click)="send(q)">{{ q }}</button>
      }
    </div>

    <form class="dbg-ask" (ngSubmit)="send(draft)">
      <textarea
        name="message"
        rows="2"
        maxlength="2000"
        aria-label="Ask the Debug coach"
        placeholder="Ask about the code…"
        [(ngModel)]="draft"
        (keydown.enter)="onEnter($event)"
      ></textarea>
      <button type="submit" class="btn btn-primary" [disabled]="store.asking() || !draft.trim()">
        <i class="ms" aria-hidden="true">send</i><span class="sr-only">Send</span>
      </button>
    </form>
    <label class="dbg-toggle">
      <input
        type="checkbox"
        role="switch"
        [checked]="store.solutionMode()"
        (change)="store.solutionMode.set($any($event.target).checked)"
      />
      <span class="dbg-switch" aria-hidden="true"></span>
      <span>
        <b>Solution</b>
        <span class="faint">{{
          store.solutionMode()
            ? ' on: the coach explains the exact fixes. You still type them yourself.'
            : ' off: hints and explanations only.'
        }}</span>
      </span>
    </label>
    @if (store.solutionMode() && !store.solved()) {
      <span class="faint" style="font-size:11.5px">Using the solution is noted on this attempt.</span>
    }
  `,
})
export class DebugAssistantComponent {
  readonly store = inject(DebugExerciseStore);
  readonly quick = QUICK;
  draft = '';

  private readonly thread = viewChild.required<ElementRef<HTMLElement>>('thread');
  readonly rendered = computed(() =>
    this.store.chat().map((m) => ({ ...m, blocks: m.role === 'assistant' ? parseReply(m.text) : [] })),
  );

  constructor() {
    effect(() => {
      this.rendered();
      this.store.asking();
      untracked(() => queueMicrotask(() => this.thread().nativeElement.scrollTo({ top: 1e9, behavior: 'smooth' })));
    });
  }

  send(text: string) {
    if (!text.trim()) return;
    this.draft = '';
    void this.store.ask(text);
  }

  onEnter(event: Event) {
    const e = event as KeyboardEvent;
    if (e.shiftKey) return;
    e.preventDefault();
    this.send(this.draft);
  }
}
