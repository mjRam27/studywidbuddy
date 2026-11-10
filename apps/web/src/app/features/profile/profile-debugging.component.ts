import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DEBUG_LEVEL_LABEL, DEBUG_LEVELS, type DebugProfileStats } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { longDate } from '../../core/format';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { duration, LEVEL_CLASS } from '../debug/debug-format';

/** Debugging on a profile: exercises solved per level, typical solve time and recent solves. */
@Component({
  selector: 'sb-profile-debugging',
  imports: [RouterLink, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel pad-lg" aria-labelledby="dbg-h">
      <span class="panel-title" id="dbg-h">Debugging</span>
      @if (error(); as e) {
        <sb-error-state [error]="e" (retry)="load()" />
      } @else if (!stats()) {
        <sb-skeleton [rows]="3" />
      } @else {
        @let s = stats()!;
        <div class="dbg-stats">
          <div>
            <b>{{ s.solved }}</b
            ><span class="faint sm">solved</span>
          </div>
          @for (l of levels; track l) {
            <div>
              <b>{{ s.byLevel[l] }}</b
              ><span class="dbg-level" [class]="'dbg-level ' + levelClass[l]">{{ levelLabel[l] }}</span>
            </div>
          }
          <div>
            <b>{{ median() }}</b
            ><span class="faint sm">typical solve</span>
          </div>
        </div>
        @if (s.recent.length) {
          <span class="section-label">RECENTLY SOLVED</span>
          @for (r of s.recent; track r.slug) {
            <div class="act-item">
              <i class="ms" aria-hidden="true">bug_report</i>
              <a class="act-title" [routerLink]="['/debug', r.slug]">{{ r.title }}</a>
              <span class="dbg-level" [class]="'dbg-level ' + levelClass[r.level]">{{ levelLabel[r.level] }}</span>
              <span class="faint mono" style="margin-left:auto;font-size:11.5px"
                >{{ fmt(r.durationSec) }} · {{ day(r.solvedAt) }}</span
              >
            </div>
          }
        } @else {
          <span class="faint sm"
            >No Debug exercises solved yet. <a routerLink="/debug">Fix your first bug</a> and it shows up here.</span
          >
        }
      }
    </section>
  `,
})
export class ProfileDebuggingComponent {
  private readonly api = inject(Api);

  readonly username = input.required<string>();
  readonly levels = DEBUG_LEVELS;
  readonly levelLabel = DEBUG_LEVEL_LABEL;
  readonly levelClass = LEVEL_CLASS;
  readonly stats = signal<DebugProfileStats | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly fmt = duration;
  readonly day = longDate;
  readonly median = () => {
    const m = this.stats()?.medianSolveSec;
    return m === null || m === undefined ? '–' : duration(m);
  };

  constructor() {
    effect(() => {
      this.username();
      untracked(() => void this.load());
    });
  }

  async load() {
    this.error.set(null);
    try {
      this.stats.set(await this.api.debugStats(this.username()));
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }
}
