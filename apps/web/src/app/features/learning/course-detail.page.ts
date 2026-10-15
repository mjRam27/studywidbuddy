import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ErrorCode,
  SkillLevel,
  type AssessmentSummary,
  type CourseDetail,
  type EnrollmentView,
} from '@studywidbuddy/shared';
import { AuthService } from '../../core/auth.service';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { levelLabel } from '../../core/format';
import { LearningStore } from '../../core/learning.store';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { LevelBadgeComponent } from '../../ui/level-badge.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

const LEVEL_HELP: Record<SkillLevel, string> = {
  BEGINNER: 'New to this, or only tried the basics.',
  INTERMEDIATE: 'You can build small things but get stuck on structure.',
  ADVANCED: 'You use it at work and want depth.',
};

/**
 * Course detail: outline, outcomes, the enrollment panel and voice-check reports. Lessons are
 * watched in the Study Workspace; progress can also be marked here.
 */
@Component({
  selector: 'sb-course-detail-page',
  imports: [RouterLink, TopbarComponent, LevelBadgeComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/learn">Learn</a><i class="ms" aria-hidden="true">chevron_right</i>
        <a routerLink="/learn/discover">Discover</a><i class="ms" aria-hidden="true">chevron_right</i>
        <b class="ellipsis">{{ course()?.title ?? 'Course' }}</b>
      </nav>
    </sb-topbar>

    <div class="page">
      @if (error()) {
        <sb-error-state
          [title]="error()!.status === 404 ? 'Course not found' : 'This course didn’t load'"
          [error]="error()"
          (retry)="load()"
        />
      } @else if (!course()) {
        <sb-skeleton [rows]="6" [height]="20" />
      } @else {
        @let c = course()!;
        <div class="detail-grid">
          <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
            <div class="detail-hero">
              <span class="eyebrow">{{ c.category }}</span>
              <h1>{{ c.title }}</h1>
              <p class="sum">{{ c.summary }}</p>
              <div class="detail-meta">
                <sb-level-badge [level]="c.level" />
                <span><i class="ms" aria-hidden="true">schedule</i>{{ c.estimatedHours }} hours</span>
                <span
                  ><i class="ms" aria-hidden="true">view_module</i>{{ c.moduleCount }} modules ·
                  {{ c.lessonCount }} lessons</span
                >
                <span><i class="ms" aria-hidden="true">group</i>{{ c.activeLearners }} learning now</span>
              </div>
              <div class="chips">
                @for (s of c.skills; track s.id) {
                  <span class="chip">{{ s.name }}</span>
                }
              </div>
            </div>

            <section class="panel pad-lg" aria-labelledby="about-h">
              <span class="panel-title" id="about-h">About this course</span>
              <p style="font-size:14px;line-height:1.6;color:var(--ink-2)">{{ c.description }}</p>
              @if (c.outcomes.length) {
                <span class="section-label">YOU’LL BE ABLE TO</span>
                <div class="outcomes">
                  @for (o of c.outcomes; track o) {
                    <span><i class="ms" aria-hidden="true">check_circle</i>{{ o }}</span>
                  }
                </div>
              }
            </section>

            <section class="panel pad-lg" aria-labelledby="outline-h">
              <div class="panel-head">
                <span class="panel-title" id="outline-h">Course outline</span>
                @if (enrollment(); as e) {
                  <span class="mono faint" style="margin-left:auto;font-size:12px"
                    >{{ doneCount() }} / {{ c.lessonCount }} DONE</span
                  >
                }
              </div>
              @if (isAdmin()) {
                <a
                  class="btn btn-ghost xs"
                  style="align-self:flex-start"
                  [routerLink]="['/learn/courses', c.slug, 'manage']"
                  ><i class="ms" aria-hidden="true">video_settings</i>Manage lesson videos</a
                >
              }
              @for (m of c.modules; track m.id) {
                <div class="module">
                  <div class="module-head">
                    <span class="mono">MODULE {{ m.position }}</span
                    ><b>{{ m.title }}</b>
                  </div>
                  @for (l of m.lessons; track l.id) {
                    <div
                      class="lesson"
                      [class.done]="done().has(l.id)"
                      [class.next]="enrollment()?.nextLesson?.id === l.id"
                    >
                      <i class="ms" aria-hidden="true">{{
                        done().has(l.id)
                          ? 'check_circle'
                          : enrollment()?.nextLesson?.id === l.id
                            ? 'play_circle'
                            : 'radio_button_unchecked'
                      }}</i>
                      <span class="label">{{ m.position }}.{{ l.position }}</span>
                      @if (enrollment()) {
                        <a
                          class="grow lesson-link"
                          [routerLink]="['/learn/courses', c.slug, 'study']"
                          [queryParams]="{ lesson: l.id }"
                          >{{ l.title }}</a
                        >
                      } @else {
                        <span class="grow">{{ l.title }}</span>
                      }
                      @if (l.hasVideo) {
                        <i class="ms faint" style="font-size:16px" title="Has a video" aria-label="Has a video"
                          >smart_display</i
                        >
                      }
                      @if (isActive() && !done().has(l.id)) {
                        <button
                          type="button"
                          class="btn btn-ghost xs"
                          [disabled]="busyLesson() === l.id"
                          (click)="completeLesson(l.id)"
                        >
                          @if (busyLesson() === l.id) {
                            <span class="spinner" aria-hidden="true"></span>
                          }
                          Mark done
                        </button>
                      }
                      <span class="dur">{{ minutes(l.durationSec) }}</span>
                    </div>
                  }
                </div>
              }
            </section>
          </div>

          <aside class="panel pad-lg enroll-card" aria-labelledby="enroll-h">
            @if (isActive()) {
              @let e = enrollment()!;
              <span class="eyebrow" id="enroll-h">IN YOUR SLOTS · {{ levelLabel(e.level).toUpperCase() }}</span>
              <div class="progress">
                <div class="progress-track"><div [style.width.%]="e.progress"></div></div>
                <span class="mono">{{ e.progress }}%</span>
              </div>
              @if (e.nextLesson; as n) {
                <div class="facts">
                  <span>Next</span><span>{{ n.label }} {{ n.title }}</span>
                </div>
              }
              <a class="btn btn-primary lg block" [routerLink]="['/learn/courses', c.slug, 'study']"
                ><i class="ms" aria-hidden="true">play_arrow</i>Open Study Workspace</a
              >
              @if (e.progress === 100) {
                <button type="button" class="btn btn-secondary block" [disabled]="busy()" (click)="complete()">
                  @if (busy()) {
                    <span class="spinner" aria-hidden="true"></span>
                  }
                  <i class="ms" aria-hidden="true">workspace_premium</i>Complete course
                </button>
              } @else if (e.nextLesson) {
                @let n = e.nextLesson!;
                <button
                  type="button"
                  class="btn btn-secondary block"
                  [disabled]="busyLesson() === n.id"
                  (click)="completeLesson(n.id)"
                >
                  <i class="ms" aria-hidden="true">check</i>Mark {{ n.label }} done
                </button>
              }
              <button
                type="button"
                class="btn btn-ghost block"
                style="color:var(--danger)"
                [disabled]="busy()"
                (click)="leave()"
              >
                <i class="ms" aria-hidden="true">logout</i>Leave course
              </button>
            } @else if (enrollment()?.status === 'COMPLETED') {
              <span class="status ok" style="font-size:13px"
                ><i class="ms" aria-hidden="true">verified</i>Completed</span
              >
              <p class="muted sm">You finished this course. Its skills now show as proven on your profile.</p>
              <a class="btn btn-primary block" [routerLink]="['/learn/courses', c.slug, 'study']"
                ><i class="ms" aria-hidden="true">replay</i>Review in Study Workspace</a
              >
              <a class="btn btn-secondary block" routerLink="/learn">Back to My Learning</a>
            } @else {
              <span class="panel-title" id="enroll-h">Start this course</span>
              <div class="level-choice" role="radiogroup" aria-label="Your current level">
                @for (l of levels; track l) {
                  <button
                    type="button"
                    role="radio"
                    [class.on]="level() === l"
                    [attr.aria-checked]="level() === l"
                    (click)="level.set(l)"
                  >
                    <span class="radio" [class.on]="level() === l" aria-hidden="true"></span>
                    <span style="display:flex;flex-direction:column"
                      ><span class="t">{{ levelLabel(l) }}</span
                      ><span class="s">{{ levelHelp[l] }}</span></span
                    >
                  </button>
                }
              </div>
              <span class="field-hint"
                >Honest, not a test. It’s used to match you with a partner, and you can change your mind later.</span
              >
              @if (store.full()) {
                <div class="banner warn" style="font-size:12.5px">
                  <i class="ms" aria-hidden="true">info</i>
                  <span
                    >All {{ store.maxActive() }} slots are in use.
                    <a routerLink="/learn">Complete or leave a course</a> to start this one.</span
                  >
                </div>
              }
              <button
                type="button"
                class="btn btn-primary lg block"
                [disabled]="busy() || store.full()"
                (click)="enroll()"
              >
                @if (busy()) {
                  <span class="spinner" aria-hidden="true"></span>Starting…
                } @else {
                  Start Learning
                }
              </button>
              <span class="faint sm" style="text-align:center"
                >{{ store.active().length }} of {{ store.maxActive() }} slots in use</span
              >
            }
            @if (enrollment(); as e) {
              <div class="reports-mini">
                <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>VOICE CHECK REPORTS</span>
                @for (r of reports(); track r.id) {
                  <a
                    class="report-mini"
                    [routerLink]="['/learn/courses', c.slug, 'study']"
                    [queryParams]="{ tab: 'check', check: r.id }"
                  >
                    <span class="mono">{{ r.overallScore ?? '–' }}{{ r.overallScore !== null ? '/100' : '' }}</span>
                    <span class="grow">{{ r.status === 'EVALUATED' ? 'Report' : 'In progress' }}</span>
                    <span class="faint">{{ shortDate(r.createdAt) }}</span>
                  </a>
                } @empty {
                  <span class="faint sm"
                    >Explain what you learnt out loud and get a report. Open the Study Workspace to start.</span
                  >
                }
              </div>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class CourseDetailPage {
  readonly store = inject(LearningStore);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  readonly course = signal<CourseDetail | null>(null);
  readonly enrollment = signal<EnrollmentView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly busyLesson = signal<string | null>(null);
  readonly level = signal<SkillLevel>(SkillLevel.BEGINNER);
  /** Lesson ids completed in this enrollment, as reported by the API. */
  readonly done = signal<Set<string>>(new Set());
  readonly reports = signal<AssessmentSummary[]>([]);
  private readonly auth = inject(AuthService);
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');

  readonly levels = [SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED];
  readonly levelHelp = LEVEL_HELP;
  readonly levelLabel = levelLabel;
  readonly isActive = computed(() => this.enrollment()?.status === 'ACTIVE');
  readonly doneCount = computed(() => this.done().size);

  constructor() {
    effect(() => {
      this.slug();
      untracked(() => void this.load());
    });
    if (!this.store.data()) void this.store.load();
  }

  shortDate(iso: string) {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }

  minutes(sec: number) {
    return `${Math.round(sec / 60)} min`;
  }

  async load() {
    this.error.set(null);
    this.course.set(null);
    this.enrollment.set(null);
    this.done.set(new Set());
    this.reports.set([]);
    try {
      const c = await this.api.course(this.slug());
      this.course.set(c);
      this.level.set(c.level);
      if (c.myEnrollmentId) {
        const [e, reports] = await Promise.all([
          this.api.enrollment(c.myEnrollmentId),
          this.api.assessments(c.myEnrollmentId).catch(() => []),
        ]);
        this.setEnrollment(e);
        this.reports.set(reports);
      }
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  private setEnrollment(e: EnrollmentView) {
    this.enrollment.set(e);
    this.done.set(new Set(e.completedLessonIds));
  }

  async enroll() {
    const c = this.course();
    if (!c) return;
    this.busy.set(true);
    try {
      const e = await this.api.enroll(c.id, this.level());
      this.setEnrollment(e);
      this.toast.ok(`${c.title} is in your slots. Good luck!`);
      await this.store.load();
    } catch (err) {
      const e = toApiError(err);
      this.toast.error(e.message);
      if (e.code === ErrorCode.ACTIVE_COURSE_LIMIT_REACHED || e.code === ErrorCode.ALREADY_ENROLLED)
        await this.store.load();
    } finally {
      this.busy.set(false);
    }
  }

  async completeLesson(lessonId: string) {
    const e = this.enrollment();
    if (!e) return;
    this.busyLesson.set(lessonId);
    try {
      const updated = await this.api.completeLesson(e.id, lessonId);
      this.setEnrollment(updated);
      void this.store.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busyLesson.set(null);
    }
  }

  async complete() {
    const e = this.enrollment();
    if (!e) return;
    this.busy.set(true);
    try {
      this.setEnrollment(await this.api.completeCourse(e.id));
      this.toast.ok(`You completed ${this.course()!.title}. Its skills are now proven on your profile.`);
      await this.store.load();
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }

  async leave() {
    const e = this.enrollment();
    if (!e || !confirm(`Leave ${this.course()!.title}? The slot frees up right away.`)) return;
    this.busy.set(true);
    try {
      await this.api.deregister(e.id);
      this.toast.ok(`You left ${this.course()!.title}.`);
      await Promise.all([this.store.load(), this.load()]);
    } catch (err) {
      this.toast.error(toApiError(err).message);
    } finally {
      this.busy.set(false);
    }
  }
}
