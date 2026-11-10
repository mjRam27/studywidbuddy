import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  type ElementRef,
  input,
  output,
  untracked,
  viewChild,
} from '@angular/core';
import { CONTRIBUTION_KIND_LABEL, type ContributionDay } from '@studywidbuddy/shared';

export interface GraphCell {
  day: ContributionDay;
  level: 0 | 1 | 2 | 3 | 4;
  label: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function levelOf(count: number): GraphCell['level'] {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  if (count <= 5) return 3;
  return 4;
}

export function cellLabel(day: ContributionDay): string {
  const when = new Date(`${day.date}T00:00:00Z`).toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (!day.count) return `Nothing on ${when}`;
  const what = day.kinds.map((k) => CONTRIBUTION_KIND_LABEL[k].toLowerCase()).join(', ');
  return `${day.count} ${day.count === 1 ? 'thing' : 'things'} on ${when}: ${what}`;
}

/** Columns of 7 (Sunday first), like GitHub. Leading empty cells pad the first week. */
export function toWeeks(days: ContributionDay[]): (GraphCell | null)[][] {
  if (!days.length) return [];
  const cells: (GraphCell | null)[] = [
    ...Array<null>(weekday(days[0].date)).fill(null),
    ...days.map((day) => ({ day, level: levelOf(day.count), label: cellLabel(day) })),
  ];
  const weeks: (GraphCell | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** Month labels: the week column holding each month's first days (a partial first month gets none). */
export function monthLabels(weeks: (GraphCell | null)[][]): { col: number; text: string }[] {
  const out: { col: number; text: string }[] = [];
  let last = -1;
  weeks.forEach((week, col) => {
    const first = week.find((c) => c && Number(c.day.date.slice(8)) <= 7);
    if (!first) return;
    const month = Number(first.day.date.slice(5, 7)) - 1;
    if (month !== last) out.push({ col, text: MONTHS[month] });
    last = month;
  });
  return out;
}

/** The activity graph: one square per day, darker for more work. Click a day to see it. */
@Component({
  selector: 'sb-contribution-graph',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cg" #scroller role="group" [attr.aria-label]="ariaLabel()">
      <div class="cg-months" aria-hidden="true" [style.grid-template-columns]="'repeat(' + weeks().length + ', 1fr)'">
        @for (m of months(); track m.col) {
          <span [style.grid-column]="m.col + 1">{{ m.text }}</span>
        }
      </div>
      <div class="cg-grid">
        @for (week of weeks(); track $index) {
          <div class="cg-week">
            @for (cell of week; track $index) {
              @if (cell) {
                <button
                  type="button"
                  class="cg-cell"
                  [class]="'cg-cell l' + cell.level"
                  [class.on]="cell.day.date === selected()"
                  [attr.aria-label]="cell.label"
                  [attr.aria-pressed]="cell.day.date === selected()"
                  [title]="cell.label"
                  (click)="pick.emit(cell.day.date)"
                ></button>
              } @else {
                <span class="cg-cell empty" aria-hidden="true"></span>
              }
            }
          </div>
        }
      </div>
      <div class="cg-legend" aria-hidden="true">
        <span>Less</span>
        @for (l of [0, 1, 2, 3, 4]; track l) {
          <span class="cg-cell" [class]="'cg-cell l' + l"></span>
        }
        <span>More</span>
      </div>
    </div>
  `,
})
export class ContributionGraphComponent {
  readonly days = input.required<ContributionDay[]>();
  readonly selected = input<string | null>(null);
  readonly pick = output<string>();

  readonly weeks = computed(() => toWeeks(this.days()));
  readonly months = computed(() => monthLabels(this.weeks()));
  readonly ariaLabel = computed(() => `Activity over the last ${this.days().length} days`);

  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('scroller');

  constructor() {
    // Like GitHub: on narrow screens, start at the most recent weeks.
    effect(() => {
      this.weeks();
      untracked(() =>
        queueMicrotask(() => {
          const el = this.scroller().nativeElement;
          el.scrollLeft = el.scrollWidth;
        }),
      );
    });
  }
}
