import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  CONTRIBUTION_KIND_LABEL,
  CONTRIBUTION_KINDS,
  type ContributionCalendar,
  type ContributionDayDetail,
  type ContributionKind,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { ContributionGraphComponent } from '../../ui/contribution-graph.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

const KIND_ICON: Record<ContributionKind, string> = {
  DEBUG: 'bug_report',
  STUDY: 'school',
  TASK: 'task_alt',
  PROJECT: 'deployed_code',
  INTERVIEW: 'record_voice_over',
};

/**
 * The profile's activity graph. A square fills only for real work: a solved Debug exercise,
 * 30+ minutes of study, a finished task, project work or an AI interview. Filter by kind,
 * click a day to see what was done.
 */
@Component({
  selector: 'sb-profile-activity',
  imports: [RouterLink, ContributionGraphComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel pad-lg" aria-labelledby="act-h">
      <div class="panel-head" style="flex-wrap:wrap;gap:8px">
        <span class="panel-title" id="act-h">Activity</span>
        @if (calendar(); as c) {
          <span class="faint sm"
            >{{ total() }} {{ total() === 1 ? 'thing' : 'things' }} on {{ c.activeDays }} day{{
              c.activeDays === 1 ? '' : 's'
            }}
            this year · {{ c.streak }}-day streak</span
          >
        }
      </div>
      <div class="filter-row" role="group" aria-label="Show activity of kind">
        @for (k of kinds; track k) {
          <button
            type="button"
            class="pill"
            [class.on]="shown().has(k)"
            [attr.aria-pressed]="shown().has(k)"
            (click)="toggle(k)"
          >
            <i class="ms" aria-hidden="true" style="font-size:15px">{{ icon[k] }}</i
            >{{ label[k] }}
            @if (calendar(); as c) {
              <span class="faint">{{ c.totals[k] }}</span>
            }
          </button>
        }
      </div>

      @if (error(); as e) {
        <sb-error-state [error]="e" (retry)="load()" />
      } @else if (!calendar()) {
        <sb-skeleton [rows]="4" />
      } @else {
        <sb-contribution-graph [days]="calendar()!.days" [selected]="selected()" (pick)="open($event)" />
        <span class="faint" style="font-size:11.5px"
          >A day counts when you solve a Debug exercise, study 30+ minutes, finish a task, work on a project, or take an
          interview.</span
        >
        @if (detail(); as d) {
          <div class="act-day" aria-live="polite">
            <span class="section-label">{{ dayTitle(d.date) }}</span>
            @for (i of d.items; track $index) {
              <div class="act-item">
                <i class="ms" aria-hidden="true">{{ icon[i.kind] }}</i>
                <div style="display:flex;flex-direction:column;min-width:0">
                  @if (i.link) {
                    <a [routerLink]="i.link" class="act-title">{{ i.title }}</a>
                  } @else {
                    <span class="act-title">{{ i.title }}</span>
                  }
                  @if (i.detail) {
                    <span class="faint" style="font-size:12px">{{ i.detail }}</span>
                  }
                </div>
                <span class="tag" style="margin-left:auto">{{ label[i.kind] }}</span>
              </div>
            } @empty {
              <span class="faint sm">Nothing counted on this day.</span>
            }
          </div>
        }
      }
    </section>
  `,
})
export class ProfileActivityComponent {
  private readonly api = inject(Api);

  readonly username = input.required<string>();
  readonly kinds = CONTRIBUTION_KINDS;
  readonly label = CONTRIBUTION_KIND_LABEL;
  readonly icon = KIND_ICON;

  readonly shown = signal(new Set<ContributionKind>(CONTRIBUTION_KINDS));
  readonly calendar = signal<ContributionCalendar | null>(null);
  readonly detail = signal<ContributionDayDetail | null>(null);
  readonly selected = signal<string | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly total = computed(() => (this.calendar()?.days ?? []).reduce((n, d) => n + d.count, 0));

  private readonly kindsParam = computed(() =>
    this.shown().size === CONTRIBUTION_KINDS.length ? undefined : [...this.shown()].join(','),
  );

  constructor() {
    effect(() => {
      this.username();
      this.kindsParam();
      untracked(() => void this.load());
    });
  }

  toggle(k: ContributionKind) {
    const next = new Set(this.shown());
    if (next.has(k)) next.delete(k);
    else next.add(k);
    // An empty filter would show nothing; treat it as "everything" again.
    this.shown.set(next.size ? next : new Set(CONTRIBUTION_KINDS));
  }

  async load() {
    this.error.set(null);
    try {
      const cal = await this.api.contributions(this.username(), this.kindsParam());
      this.calendar.set(cal);
      // Open the selected day again, or the most recent active one.
      const day = this.selected() ?? [...cal.days].reverse().find((d) => d.count)?.date ?? cal.to;
      await this.open(day);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  async open(date: string) {
    this.selected.set(date);
    try {
      this.detail.set(await this.api.contributionDay(this.username(), date, this.kindsParam()));
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  dayTitle(date: string) {
    return new Date(`${date}T00:00:00Z`)
      .toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
      .toUpperCase();
  }
}
