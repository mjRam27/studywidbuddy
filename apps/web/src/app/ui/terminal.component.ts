import {
  ChangeDetectionStrategy,
  Component,
  effect,
  type ElementRef,
  input,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

export type TermTone = 'cmd' | 'ok' | 'err' | 'warn' | 'muted' | 'plain';
export interface TermLine {
  tone: TermTone;
  text: string;
}

/** A terminal look-alike: shows lines and emits typed commands (with ↑/↓ history). */
@Component({
  selector: 'sb-terminal',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="term-head">
      <i class="ms" aria-hidden="true">terminal</i><span class="mono">{{ title() }}</span>
      @if (busy()) {
        <span class="spinner" aria-hidden="true" style="margin-left:auto"></span>
      }
    </div>
    <div class="term-body" #body role="log" aria-live="polite" [attr.aria-label]="title() + ' output'">
      @for (l of lines(); track $index) {
        <div class="term-line" [class]="'term-line ' + l.tone">{{ l.text }}</div>
      }
    </div>
    <form class="term-input" (ngSubmit)="submit()">
      <span class="mono" aria-hidden="true">$</span>
      <input
        class="mono"
        name="cmd"
        autocomplete="off"
        spellcheck="false"
        [attr.aria-label]="'Type a command, e.g. ' + placeholder()"
        [placeholder]="placeholder()"
        [disabled]="busy()"
        [(ngModel)]="draft"
        (keydown.arrowup)="recall(-1, $event)"
        (keydown.arrowdown)="recall(1, $event)"
      />
    </form>
  `,
})
export class TerminalComponent {
  readonly lines = input.required<TermLine[]>();
  readonly busy = input(false);
  readonly title = input('Terminal');
  readonly placeholder = input('npm test');
  readonly execute = output<string>();

  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly history = signal<string[]>([]);
  private cursor = 0;
  draft = '';

  constructor() {
    effect(() => {
      this.lines();
      untracked(() => queueMicrotask(() => this.body().nativeElement.scrollTo({ top: 1e9 })));
    });
  }

  submit() {
    const cmd = this.draft.trim();
    if (!cmd) return;
    this.history.update((h) => [...h.filter((x) => x !== cmd), cmd].slice(-30));
    this.cursor = this.history().length;
    this.draft = '';
    this.execute.emit(cmd);
  }

  recall(step: number, event: Event) {
    const h = this.history();
    if (!h.length) return;
    event.preventDefault();
    this.cursor = Math.min(h.length, Math.max(0, this.cursor + step));
    this.draft = h[this.cursor] ?? '';
  }
}
