import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { JOB_SOURCES, type JobDetail } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { relativeTime } from '../../core/format';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { JobMatchComponent } from './job-match.component';

/** Job detail + match explanation, with courses that close the gaps. Apply goes to the original posting. */
@Component({
  selector: 'sb-job-detail-page',
  imports: [RouterLink, TopbarComponent, ErrorStateComponent, SkeletonComponent, JobMatchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/jobs">Jobs</a><i class="ms" aria-hidden="true">chevron_right</i>
        <span class="ellipsis">{{ job()?.title ?? 'Job' }}</span>
      </nav>
    </sb-topbar>

    <div class="page">
      @if (error()) {
        <sb-error-state [error]="error()" (retry)="load()" />
      } @else if (!job()) {
        <sb-skeleton [rows]="8" />
      } @else {
        @let j = job()!;
        <div class="job-detail">
          <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <div class="page-head-text">
              <span class="eyebrow">{{ j.company.toUpperCase() }}</span>
              <h1>{{ j.title }}</h1>
              <span class="subline"
                >{{ j.location }}{{ j.remote ? ' · Remote' : '' }}{{ j.employment ? ' · ' + j.employment : '' }} ·
                posted {{ ago(j.postedAt) }}</span
              >
            </div>
            <section class="panel pad-lg" aria-labelledby="desc-h">
              <span class="panel-title" id="desc-h">About the role</span>
              <p class="job-description">
                {{ j.description || 'The posting has no description. Open it for details.' }}
              </p>
              <span class="faint sm"
                >From <a [href]="source(j).url" target="_blank" rel="noopener">{{ source(j).label }}</a
                >. Details may have changed: check the original posting.</span
              >
            </section>
          </div>

          <aside style="display:flex;flex-direction:column;gap:14px">
            <section class="panel pad-lg" aria-labelledby="fit-h">
              <div style="display:flex;align-items:baseline;gap:8px">
                <span class="panel-title" id="fit-h">Your match</span>
                @if (j.match.score !== null) {
                  <span class="job-score mono" style="margin-left:auto" [class.low]="j.match.score < 50"
                    >{{ j.match.score }}%</span
                  >
                }
              </div>
              <sb-job-match [match]="j.match" />
              <span class="faint" style="font-size:11.5px;line-height:1.5"
                >Skills proven by a finished course or project count fully; skills only on your profile count a bit
                less.</span
              >
              <a class="btn btn-primary lg block" [href]="j.url" target="_blank" rel="noopener noreferrer"
                >Apply on {{ source(j).label }}<i class="ms" aria-hidden="true">open_in_new</i></a
              >
            </section>
            @if (j.match.gaps.length) {
              <section class="panel pad-lg" aria-labelledby="gap-h">
                <span class="panel-title" id="gap-h">Close the gaps</span>
                @for (c of j.courses; track c.slug) {
                  <a class="app-item" [routerLink]="['/learn/courses', c.slug]">
                    <span class="t">{{ c.title }}</span>
                    <span class="faint" style="font-size:12px">Teaches {{ c.covers.join(', ') }}</span>
                  </a>
                } @empty {
                  <span class="faint sm">No course in the catalogue covers {{ j.match.gaps.join(', ') }} yet.</span>
                }
              </section>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class JobDetailPage {
  private readonly api = inject(Api);
  readonly id = input.required<string>();
  readonly job = signal<JobDetail | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly ago = (iso: string) => relativeTime(iso);
  readonly source = (j: JobDetail) => JOB_SOURCES[j.source];

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
  }

  async load() {
    this.error.set(null);
    try {
      this.job.set(await this.api.job(this.id()));
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }
}
