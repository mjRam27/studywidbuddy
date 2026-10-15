import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { SkillLevel, type CourseSummary } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { levelLabel } from '../../core/format';
import { LearningStore } from '../../core/learning.store';
import { TopbarComponent } from '../../layout/topbar.component';
import { LevelBadgeComponent } from '../../ui/level-badge.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

const LEVELS: (SkillLevel | 'ALL')[] = ['ALL', SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED];

/** Course catalogue with search and filters (new screen, built in the Learning visual language). */
@Component({
  selector: 'sb-discover-courses-page',
  imports: [RouterLink, FormsModule, TopbarComponent, LevelBadgeComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Learn</span>
      <nav class="tabs" aria-label="Learn">
        <a class="tab" routerLink="/learn">My Learning</a>
        <a class="tab on" routerLink="/learn/discover" aria-current="page">Discover</a>
      </nav>
    </sb-topbar>
    <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <h1>Discover courses</h1>
          <span class="subline">
            @if (store.full()) {
              All {{ store.maxActive() }} slots are in use. You can browse, and start a course after you finish or leave
              one.
            } @else {
              Pick something to learn. You have {{ store.maxActive() - store.active().length }} free slot{{
                store.maxActive() - store.active().length === 1 ? '' : 's'
              }}.
            }
          </span>
        </div>
      </div>

      <div class="filter-bar">
        <form class="search-box" role="search" (ngSubmit)="applySearch()" style="background:var(--surface)">
          <i class="ms" aria-hidden="true">search</i>
          <input aria-label="Search courses" placeholder="Search by course or skill" name="q" [(ngModel)]="draft" />
        </form>
        <span class="divider" aria-hidden="true"></span>
        <div role="group" aria-label="Level" style="display:flex;gap:6px;flex-wrap:wrap">
          @for (l of levels; track l) {
            <button
              type="button"
              class="pill"
              [class.on]="level() === l"
              [attr.aria-pressed]="level() === l"
              (click)="level.set(l)"
            >
              {{ l === 'ALL' ? 'All levels' : levelLabel(l) }}
            </button>
          }
        </div>
      </div>

      @if (error()) {
        <sb-error-state [error]="error()" (retry)="load()" />
      } @else if (loading()) {
        <div class="course-cards">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="course-tile"><sb-skeleton [rows]="4" /></div>
          }
        </div>
      } @else {
        <div class="course-cards">
          @for (c of courses(); track c.id) {
            <a class="course-tile" [routerLink]="['/learn/courses', c.slug]">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="eyebrow">{{ c.category }}</span>
                <span style="margin-left:auto"><sb-level-badge [level]="c.level" /></span>
              </div>
              <span class="display">{{ c.title }}</span>
              <span class="sum">{{ c.summary }}</span>
              <div class="chips">
                @for (s of c.skills; track s.id) {
                  <span class="chip">{{ s.name }}</span>
                }
              </div>
              <div class="meta">
                <span><i class="ms" aria-hidden="true">schedule</i>{{ c.estimatedHours }} h</span>
                <span><i class="ms" aria-hidden="true">menu_book</i>{{ c.lessonCount }} lessons</span>
                <span><i class="ms" aria-hidden="true">group</i>{{ c.activeLearners }} learning now</span>
                @if (activeCourseIds().has(c.id)) {
                  <span class="state" style="color:var(--brand);margin-left:auto"
                    ><i class="ms" aria-hidden="true">play_circle</i>In your slots</span
                  >
                }
              </div>
            </a>
          } @empty {
            <div class="empty" style="grid-column:1/-1">
              <span class="empty-title">No courses match</span>
              <span class="empty-text">Try a different word or level.</span>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear filters</button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DiscoverCoursesPage {
  readonly store = inject(LearningStore);
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  /** From the `?q=` query param. */
  readonly q = input<string | undefined>();
  readonly levels = LEVELS;
  readonly levelLabel = levelLabel;

  readonly level = signal<SkillLevel | 'ALL'>('ALL');
  readonly courses = signal<CourseSummary[]>([]);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);
  readonly activeCourseIds = computed(() => new Set(this.store.active().map((e) => e.course.id)));
  draft = '';

  constructor() {
    effect(() => {
      const q = this.q();
      const level = this.level();
      untracked(() => {
        this.draft = q ?? '';
        void this.load(q, level);
      });
    });
    if (!this.store.data()) void this.store.load();
  }

  async load(q = this.q(), level = this.level()) {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.courses.set(await this.api.courses({ q, level: level === 'ALL' ? undefined : level }));
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.loading.set(false);
    }
  }

  applySearch() {
    void this.router.navigate([], { queryParams: { q: this.draft.trim() || null } });
  }

  clear() {
    this.level.set('ALL');
    void this.router.navigate([], { queryParams: { q: null } });
  }
}
