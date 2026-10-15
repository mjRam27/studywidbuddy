import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CourseRecommendation, EnrollmentView, LearningActivityItem, LearningStats } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { levelLabel, minutesLabel, relativeTime } from '../../core/format';
import { LearningStore } from '../../core/learning.store';
import { asyncState } from '../../core/resource';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { CourseCardComponent } from './course-card.component';

const ACTIVITY_ICON: Record<LearningActivityItem['kind'], { icon: string; color: string }> = {
  LESSON_COMPLETED: { icon: 'check_circle', color: 'var(--success)' },
  COURSE_STARTED: { icon: 'play_circle', color: 'var(--brand)' },
  COURSE_COMPLETED: { icon: 'workspace_premium', color: 'var(--warn)' },
  COURSE_LEFT: { icon: 'logout', color: 'var(--ink-2)' },
};

/** Screen 20 · My Learning: the 4-slot rule, on real enrollments. */
@Component({
  selector: 'sb-my-learning-page',
  imports: [RouterLink, FormsModule, TopbarComponent, CourseCardComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Learn</span>
      <nav class="tabs" aria-label="Learn">
        <a class="tab on" routerLink="/learn" aria-current="page">My Learning</a>
        <a class="tab" routerLink="/learn/discover">Discover</a>
        <span class="tab" style="color:var(--ink-4)" title="Arrives with Study Buddy matching">Study Buddies</span>
        <span class="tab" style="color:var(--ink-4)" title="Arrives with course certificates">Certificates</span>
      </nav>
      <form class="search-box" style="margin-left:auto" role="search" (ngSubmit)="search()">
        <i class="ms" aria-hidden="true">search</i>
        <input aria-label="Search courses" placeholder="Search courses" name="q" [(ngModel)]="query" />
      </form>
    </sb-topbar>

    <div class="page">
      <div class="page-head">
        <div class="page-head-text">
          <h1>My Learning</h1>
          <span class="subline">{{ subline() }}</span>
        </div>
        <div class="page-head-actions">
          <div class="slots">
            <span class="mono">{{ store.active().length }} / {{ store.maxActive() }} ACTIVE</span>
            <div class="slot-meter" aria-hidden="true">
              @for (s of slotIndexes(); track s) {
                <span [class.used]="s < store.active().length"></span>
              }
            </div>
          </div>
          @if (store.full()) {
            <button type="button" class="btn btn-primary lg" disabled [title]="limitHint()">
              <i class="ms" aria-hidden="true">add</i>Start New Course
            </button>
          } @else {
            <a class="btn btn-primary lg" routerLink="/learn/discover"
              ><i class="ms" aria-hidden="true">add</i>Start New Course</a
            >
          }
        </div>
      </div>

      @if (store.full()) {
        <div class="banner" role="note">
          <i class="ms" aria-hidden="true">info</i>
          <span
            ><b>You can have up to {{ store.maxActive() }} active courses.</b> Complete or leave a course to start
            another. With fewer courses, you and your buddies finish more of them.</span
          >
        </div>
      }

      @if (store.error() && !store.data()) {
        <sb-error-state title="Your courses didn’t load" [error]="store.error()" (retry)="store.load()" />
      } @else if (!store.data()) {
        <div class="course-grid">
          @for (i of slotIndexes(); track i) {
            <div class="course-card"><sb-skeleton [rows]="5" [height]="16" /></div>
          }
        </div>
      } @else {
        <div class="course-grid">
          @for (e of store.active(); track e.id; let i = $index) {
            <sb-course-card [enrollment]="e" [slot]="i + 1" [primary]="i === 0" (leave)="leaving.set(e)" />
          }
          @if (!store.full()) {
            <div class="empty-slot">
              <span class="eyebrow">SLOT {{ store.active().length + 1 }} · OPEN</span>
              <span class="title">{{
                store.active().length ? 'Start learning something new.' : 'Start your first course.'
              }}</span>
              <span class="desc"
                >Pick a course and choose your level. Study Buddy matching for your level is on its way.</span
              >
              @if (recs.value()?.length) {
                <div class="quick-picks">
                  @for (r of recs.value()!.slice(0, 3); track r.course.id) {
                    <a class="quick-pick" [routerLink]="['/learn/courses', r.course.slug]">
                      <span class="t">{{ r.course.title }}</span
                      ><span class="s">{{ r.reasons[0] }}</span
                      ><i class="ms" aria-hidden="true">add</i>
                    </a>
                  }
                </div>
              }
              <a class="btn btn-primary" routerLink="/learn/discover">Browse courses</a>
            </div>
          }
        </div>
      }

      @if (leaving(); as l) {
        <div class="leave-confirm" role="alertdialog" aria-labelledby="leave-title" aria-describedby="leave-desc">
          <i class="ms" aria-hidden="true">logout</i>
          <div class="leave-text">
            <b id="leave-title">Leave {{ l.course.title }}?</b>
            <span id="leave-desc"
              >Your progress stays in your history. The slot frees up right away, and you can start the course again
              later.</span
            >
          </div>
          <div class="leave-actions">
            <button type="button" class="btn btn-secondary" (click)="leaving.set(null)">Keep course</button>
            <button type="button" class="btn btn-danger" [disabled]="leavingBusy()" (click)="confirmLeave(l)">
              @if (leavingBusy()) {
                <span class="spinner" aria-hidden="true"></span>
              }
              Leave course
            </button>
          </div>
        </div>
      }

      <div class="row-3">
        <section class="panel" aria-labelledby="sessions-h">
          <div class="panel-head"><span class="panel-title" id="sessions-h">Upcoming sessions</span></div>
          <div class="session-empty">
            <span
              ><b style="color:var(--ink)">No sessions yet.</b> Study sessions are scheduled with your Study Buddy,
              which arrives with matching.</span
            >
          </div>
        </section>

        <section class="panel" aria-labelledby="streak-h">
          <div class="panel-head baseline">
            <span class="panel-title" id="streak-h">Study streak</span>
            @if (stats.value(); as s) {
              <span class="display streak-count">{{ s.streakDays }}</span
              ><span class="muted sm">{{ s.streakDays === 1 ? 'day' : 'days' }}</span>
            }
          </div>
          @if (stats.error()) {
            <span class="faint sm"
              >Couldn’t load your streak.
              <button type="button" class="link-strong" (click)="stats.reload()">Retry</button></span
            >
          } @else if (stats.value()) {
            @let s = stats.value()!;
            <div
              class="streak-grid"
              role="img"
              [attr.aria-label]="'Lessons completed per day over the last ' + s.days.length + ' days'"
            >
              @for (d of s.days; track d.date; let last = $last) {
                <span
                  [class.l1]="d.count === 1"
                  [class.l2]="d.count > 1"
                  [class.today]="last"
                  [title]="d.date + ': ' + d.count + ' lesson' + (d.count === 1 ? '' : 's')"
                ></span>
              }
            </div>
            <div class="streak-legend">
              <span class="sw" style="background:var(--brand)"></span>2+ lessons
              <span class="sw" style="background:var(--brand-tint);margin-left:8px"></span>1 lesson
              <span class="sw" style="border:1.5px solid var(--brand);margin-left:8px"></span>Today
            </div>
          } @else {
            <sb-skeleton [rows]="4" [height]="22" />
          }
        </section>

        <section class="panel" aria-labelledby="month-h">
          <span class="panel-title" id="month-h">This month</span>
          @if (stats.value(); as s) {
            <div class="stat-grid">
              <div class="stat">
                <span class="display">{{ minutesLabel(s.thisMonth.minutesLearned) }}</span
                ><span>of lessons completed</span>
              </div>
              <div class="stat">
                <span class="display">{{ s.thisMonth.lessonsCompleted }}</span
                ><span>lessons completed</span>
              </div>
              <div class="stat">
                <span class="display">{{ s.thisMonth.coursesStarted }}</span
                ><span>courses started</span>
              </div>
              <div class="stat">
                <span class="display">{{ s.thisMonth.coursesCompleted }}</span
                ><span>courses completed</span>
              </div>
            </div>
          } @else if (!stats.error()) {
            <sb-skeleton [rows]="2" [height]="56" />
          }
        </section>
      </div>

      <div class="row-2">
        <section class="panel" style="gap:10px" aria-labelledby="activity-h">
          <span class="panel-title" id="activity-h">Recent activity</span>
          @if (stats.value(); as s) {
            @for (a of s.recent; track a.at + a.kind) {
              <div class="activity-item">
                <i class="ms" aria-hidden="true" [style.color]="activityIcon[a.kind].color">{{
                  activityIcon[a.kind].icon
                }}</i>
                <span class="grow">{{ activityText(a) }}</span>
                <span class="when">{{ relativeTime(a.at) }}</span>
              </div>
            } @empty {
              <span class="faint sm">Nothing yet. Finish a lesson and it shows up here.</span>
            }
          } @else if (!stats.error()) {
            <sb-skeleton [rows]="4" />
          }
        </section>

        <section class="recs" aria-labelledby="recs-h">
          <div class="recs-head">
            <span class="panel-title" id="recs-h">Recommended for you</span>
            <span class="muted sm">Based on your skills and what you’re learning</span>
          </div>
          @if (recs.error()) {
            <sb-error-state title="Recommendations didn’t load" [error]="recs.error()" (retry)="recs.reload()" />
          } @else if (recs.value()) {
            @let list = recs.value()!;
            <div class="recs-grid">
              @for (r of list; track r.course.id) {
                <div class="rec">
                  <span class="eyebrow">{{ r.course.category }}</span>
                  <a class="rec-title" [routerLink]="['/learn/courses', r.course.slug]">{{ r.course.title }}</a>
                  <span class="rec-desc">{{ r.course.summary }}</span>
                  <div class="why-list">
                    @for (why of r.reasons; track why) {
                      <span><i class="ms" aria-hidden="true">check</i>{{ why }}</span>
                    }
                  </div>
                  <div class="rec-meta">
                    <span>{{ levelLabel(r.course.level) }}</span
                    ><span>{{ r.course.estimatedHours }} h</span><span>{{ r.course.lessonCount }} lessons</span>
                  </div>
                  @if (store.full()) {
                    <button type="button" class="btn btn-outline-brand" disabled [title]="limitHint()">
                      Slots full
                    </button>
                  } @else {
                    <a class="btn btn-outline-brand" [routerLink]="['/learn/courses', r.course.slug]">Start Learning</a>
                  }
                </div>
              } @empty {
                <div class="empty" style="grid-column:1/-1">
                  <span class="empty-text">You’re taking every course we have. New ones are on the way.</span>
                </div>
              }
            </div>
          } @else {
            <div class="recs-grid">
              @for (i of [1, 2, 3]; track i) {
                <div class="rec"><sb-skeleton [rows]="4" /></div>
              }
            </div>
          }
        </section>
      </div>
    </div>
  `,
})
export class MyLearningPage {
  readonly store = inject(LearningStore);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly stats = asyncState<LearningStats>(() => this.api.learningStats());
  readonly recs = asyncState<CourseRecommendation[]>(() => this.api.courseRecommendations());
  readonly leaving = signal<EnrollmentView | null>(null);
  readonly leavingBusy = signal(false);
  query = '';

  readonly levelLabel = levelLabel;
  readonly minutesLabel = minutesLabel;
  readonly relativeTime = relativeTime;
  readonly activityIcon = ACTIVITY_ICON;

  readonly slotIndexes = computed(() => Array.from({ length: this.store.maxActive() }, (_, i) => i));
  readonly limitHint = computed(
    () => `You can have up to ${this.store.maxActive()} active courses. Complete or leave a course to start another.`,
  );
  readonly subline = computed(() => {
    const n = this.store.active().length;
    const max = this.store.maxActive();
    if (!this.store.data()) return 'Loading your courses…';
    if (n === 0) return 'No active courses yet. Pick something to learn.';
    if (n >= max) return `All ${max} slots are in use.`;
    return `${n} of ${max} slots in use. You have room for ${max - n === 1 ? 'one more' : max - n + ' more'}.`;
  });

  constructor() {
    void this.store.load();
  }

  search() {
    void this.router.navigate(['/learn/discover'], { queryParams: { q: this.query.trim() || null } });
  }

  activityText(a: LearningActivityItem): string {
    switch (a.kind) {
      case 'LESSON_COMPLETED':
        return `You finished ${a.detail} in ${a.courseTitle}`;
      case 'COURSE_STARTED':
        return `You started ${a.courseTitle}`;
      case 'COURSE_COMPLETED':
        return `You completed ${a.courseTitle}`;
      case 'COURSE_LEFT':
        return `You left ${a.courseTitle}`;
    }
  }

  async confirmLeave(e: EnrollmentView) {
    this.leavingBusy.set(true);
    try {
      await this.api.deregister(e.id);
      this.leaving.set(null);
      this.toast.ok(`You left ${e.course.title}. A slot is free.`);
      await Promise.all([this.store.load(), this.stats.reload(), this.recs.reload()]);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.leavingBusy.set(false);
    }
  }
}
