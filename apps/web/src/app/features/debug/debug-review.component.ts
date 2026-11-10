import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUG_CATEGORY_LABEL, type DebugReview } from '@studywidbuddy/shared';
import { duration } from './debug-format';

/** After solving: how long it took, then each bug — where, what was wrong, the fix and why. */
@Component({
  selector: 'sb-debug-review',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let r = review();
    <div class="dbg-solved" role="status">
      <i class="ms" aria-hidden="true">verified</i>
      <div style="display:flex;flex-direction:column;gap:2px;min-width:0">
        <b>Solved in {{ time() }}</b>
        <span class="faint sm"
          >{{ r.attempt.runs }} test run{{ r.attempt.runs === 1 ? '' : 's' }} · {{ r.bugs.length }} bugs fixed{{
            r.attempt.solutionViewed ? ' · solution used' : ''
          }}</span
        >
      </div>
    </div>

    <span class="section-label">WHAT WAS WRONG, AND WHAT YOU FIXED</span>
    @for (b of r.bugs; track $index; let i = $index) {
      <article class="dbg-bug">
        <div class="dbg-bug-head">
          <span class="dbg-num mono">{{ i + 1 }}</span>
          <b class="grow">{{ b.title }}</b>
          <span class="tag">{{ categoryLabel(b.category) }}</span>
        </div>
        <button
          type="button"
          class="link-btn mono"
          style="font-size:11.5px;align-self:flex-start"
          title="Show this line in the editor"
          (click)="reveal.emit({ file: b.file, line: b.line })"
        >
          {{ b.file }}:{{ b.line }}
        </button>
        <div class="dbg-diff mono" role="group" aria-label="Before and after">
          @for (l of lines(b.buggy); track $index) {
            <div class="del"><span aria-hidden="true">- </span><span class="sr-only">was: </span>{{ l }}</div>
          }
          @for (l of lines(b.fixed); track $index) {
            <div class="add"><span aria-hidden="true">+ </span><span class="sr-only">now: </span>{{ l }}</div>
          }
        </div>
        <p class="sm" style="margin:0;line-height:1.55">{{ b.explanation }}</p>
      </article>
    }

    <span class="section-label">WHAT YOU PRACTISED</span>
    <div class="chips">
      @for (c of practised(); track c) {
        <span class="tag">{{ c }}</span>
      }
    </div>
    <div style="display:flex;gap:8px;flex-wrap:wrap">
      @if (next(); as n) {
        <a class="btn btn-primary" [routerLink]="['/debug', n]"
          >Next exercise<i class="ms" aria-hidden="true">arrow_forward</i></a
        >
      }
      <a class="btn btn-secondary" routerLink="/debug">All exercises</a>
    </div>
  `,
})
export class DebugReviewComponent {
  readonly review = input.required<DebugReview>();
  readonly next = input<string | null>(null);
  readonly reveal = output<{ file: string; line: number }>();

  readonly time = computed(() => duration(this.review().attempt.durationSec));
  readonly practised = computed(() => [...new Set(this.review().bugs.map((b) => BUG_CATEGORY_LABEL[b.category]))]);
  readonly categoryLabel = (c: keyof typeof BUG_CATEGORY_LABEL) => BUG_CATEGORY_LABEL[c];
  readonly lines = (s: string) => s.split('\n');
}
