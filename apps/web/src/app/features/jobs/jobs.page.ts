import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { JOB_SOURCES, type JobSummary } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { relativeTime } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { JobMatchComponent } from './job-match.component';

/** Jobs for your skills: listings from public job boards, ranked by what you've shown. */
@Component({
  selector: 'sb-jobs-page',
  imports: [RouterLink, FormsModule, TopbarComponent, ErrorStateComponent, SkeletonComponent, JobMatchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Jobs</span>
      <form class="search-box" style="margin-left:auto" role="search" (ngSubmit)="search()">
        <i class="ms" aria-hidden="true">search</i>
        <input aria-label="Search jobs" placeholder="Title, company, city or skill" name="q" [(ngModel)]="draft" />
      </form>
    </sb-topbar>

    <div class="page">
      <div class="page-head-text">
        <span class="eyebrow">CAREER</span>
        <h1>Jobs for your skills</h1>
        <span class="subline"
          >Real openings from public job boards, ranked by the skills your courses and projects prove. Each match says
          why it fits and where the gaps are.</span
        >
      </div>

      <div class="filter-rows">
        <div class="filter-row" role="group" aria-label="Show">
          <span class="label">Show</span>
          <button
            type="button"
            class="pill"
            [class.on]="scope() === 'matched'"
            [attr.aria-pressed]="scope() === 'matched'"
            (click)="setScope('matched')"
          >
            Matched to me
          </button>
          <button
            type="button"
            class="pill"
            [class.on]="scope() === 'all'"
            [attr.aria-pressed]="scope() === 'all'"
            (click)="setScope('all')"
          >
            All tech jobs
          </button>
          <button
            type="button"
            class="pill"
            [class.on]="remote()"
            [attr.aria-pressed]="remote()"
            (click)="toggleRemote()"
          >
            <i class="ms" aria-hidden="true" style="font-size:15px">home_work</i>Remote only
          </button>
          @if (isAdmin()) {
            <button
              type="button"
              class="btn btn-ghost xs"
              style="margin-left:auto"
              [disabled]="syncing()"
              (click)="sync()"
            >
              <i class="ms" aria-hidden="true">sync</i>Sync now (admin)
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <sb-error-state [error]="error()" (retry)="load()" />
      } @else if (loading() && !jobs().length) {
        <div class="job-list">
          @for (i of [1, 2, 3, 4]; track i) {
            <div class="job-card"><sb-skeleton [rows]="3" /></div>
          }
        </div>
      } @else {
        @if (noSkills() && scope() === 'matched') {
          <div class="empty">
            <i class="ms" aria-hidden="true">psychology</i>
            <span class="empty-text"
              >Add skills to your profile, or finish a course, and jobs will be matched to them.</span
            >
            <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">
              <a class="btn btn-primary" routerLink="/settings">Add skills</a>
              <button type="button" class="btn btn-secondary" (click)="setScope('all')">See all tech jobs</button>
            </div>
          </div>
        } @else {
          <div class="job-list" [attr.aria-busy]="loading()">
            @for (j of jobs(); track j.id) {
              <a class="job-card" [routerLink]="['/jobs', j.id]">
                <div class="job-card-head">
                  <span class="job-title">{{ j.title }}</span>
                  @if (j.match.score !== null) {
                    <span class="job-score mono" [class.low]="j.match.score < 50">{{ j.match.score }}% match</span>
                  }
                </div>
                <span class="job-meta"
                  >{{ j.company }} · {{ j.location }}{{ j.remote ? ' · Remote' : '' }}
                  <span class="faint">· {{ ago(j.postedAt) }} · via {{ source(j).label }}</span></span
                >
                <sb-job-match [match]="j.match" [compact]="true" />
              </a>
            } @empty {
              <div class="empty">
                <span class="empty-text">No jobs match these filters yet. Listings refresh every few hours.</span>
                <button type="button" class="btn btn-secondary" (click)="clear()">Clear filters</button>
              </div>
            }
          </div>
          @if (nextCursor()) {
            <button
              type="button"
              class="btn btn-secondary"
              style="align-self:center"
              [disabled]="loading()"
              (click)="load(true)"
            >
              @if (loading()) {
                <span class="spinner" aria-hidden="true"></span>
              }
              Show more jobs
            </button>
          }
        }
        <span class="faint sm job-credit"
          >Listings from <a href="https://www.arbeitnow.com" target="_blank" rel="noopener">Arbeitnow</a> and
          <a href="https://www.adzuna.com" target="_blank" rel="noopener">Adzuna</a>. Apply on the original posting.
          @if (lastSyncAt(); as t) {
            Updated {{ ago(t) }}.
          }
        </span>
      }
    </div>
  `,
})
export class JobsPage {
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly scope = signal<'matched' | 'all'>('matched');
  readonly remote = signal(false);
  readonly q = signal('');
  draft = '';

  readonly jobs = signal<JobSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly lastSyncAt = signal<string | null>(null);
  readonly noSkills = signal(false);
  readonly loading = signal(true);
  readonly syncing = signal(false);
  readonly error = signal<ApiError | null>(null);
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  readonly ago = (iso: string) => relativeTime(iso);
  readonly source = (j: JobSummary) => JOB_SOURCES[j.source];

  constructor() {
    void this.load();
  }

  setScope(s: 'matched' | 'all') {
    this.scope.set(s);
    void this.load();
  }

  toggleRemote() {
    this.remote.update((v) => !v);
    void this.load();
  }

  search() {
    this.q.set(this.draft.trim());
    void this.load();
  }

  clear() {
    this.q.set('');
    this.draft = '';
    this.remote.set(false);
    this.scope.set('all');
    void this.load();
  }

  async load(append = false) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.jobs({
        scope: this.scope(),
        remote: this.remote() || undefined,
        q: this.q() || undefined,
        cursor: append ? (this.nextCursor() ?? undefined) : undefined,
      });
      this.jobs.set(append ? [...this.jobs(), ...page.items] : page.items);
      this.nextCursor.set(page.nextCursor);
      this.lastSyncAt.set(page.lastSyncAt);
      this.noSkills.set(page.noSkills);
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.loading.set(false);
    }
  }

  async sync() {
    this.syncing.set(true);
    try {
      await this.api.syncJobs();
      this.toast.ok('Refreshing listings. New jobs appear in a minute or two.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.syncing.set(false);
    }
  }
}
