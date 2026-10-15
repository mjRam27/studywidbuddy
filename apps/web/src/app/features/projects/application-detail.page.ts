import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { INTERVIEW_PASS_SCORE, type ApplicationStatus, type ApplicationView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { APPLICATION_STATUS, longDate } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { LevelBadgeComponent } from '../../ui/level-badge.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { InterviewBookingComponent } from './interview-booking.component';

type Stage = 'applied' | 'screening' | 'interview' | 'evaluation' | 'seat';
const STAGES: { id: Stage; t: string }[] = [
  { id: 'applied', t: 'Applied with CV' },
  { id: 'screening', t: 'AI CV screening' },
  { id: 'interview', t: 'Voice interview' },
  { id: 'evaluation', t: 'Evaluation' },
  { id: 'seat', t: 'Team seat' },
];
const WITHDRAWABLE: ApplicationStatus[] = ['SUBMITTED', 'INTERVIEW_PENDING', 'UNDER_REVIEW'];
const REASON: Record<string, { title: string; icon: string }> = {
  CV_BELOW_THRESHOLD: { title: 'Your CV didn’t reach the interview bar this time', icon: 'description' },
  INTERVIEW_BELOW_THRESHOLD: { title: 'Not a seat this time, but here’s how to get there', icon: 'record_voice_over' },
  ROLE_FILLED: { title: 'This role filled up', icon: 'event_busy' },
};

/** Application page: CV screening result → booking → interview → seat or next steps. */
@Component({
  selector: 'sb-application-detail-page',
  imports: [
    RouterLink,
    TopbarComponent,
    LevelBadgeComponent,
    ErrorStateComponent,
    SkeletonComponent,
    InterviewBookingComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/projects">Projects</a><i class="ms" aria-hidden="true">chevron_right</i>
        <span>Applications</span><i class="ms" aria-hidden="true">chevron_right</i>
        <b class="ellipsis">{{ app()?.project?.title ?? 'Application' }}</b>
      </nav>
    </sb-topbar>
    <div class="page narrow" style="max-width:980px">
      @if (error()) {
        <sb-error-state
          [title]="error()!.status === 404 ? 'Application not found' : 'This didn’t load'"
          [error]="error()"
          (retry)="load()"
        />
      } @else if (!app()) {
        <sb-skeleton [rows]="6" [height]="20" />
      } @else {
        @let a = app()!;
        <div class="page-head">
          <div class="page-head-text">
            <span class="eyebrow">{{ a.role.title.toUpperCase() }}</span>
            <h1>{{ a.project.title }}</h1>
            <span class="status" [class]="'status ' + view().tone" style="font-size:14px">
              <i class="ms" aria-hidden="true" style="font-size:18px">{{ view().icon }}</i
              >{{ view().label }}
            </span>
          </div>
          <div class="page-head-actions">
            <sb-level-badge [level]="a.project.difficulty" />
            <a class="btn btn-secondary" [routerLink]="['/projects', a.project.slug]">View project</a>
          </div>
        </div>

        <div class="detail-grid">
          <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <!-- Seat -->
            @if (a.seat; as seat) {
              <section class="panel pad-lg seat-card" aria-labelledby="seat-h">
                <span class="status ok" style="font-size:13px"
                  ><i class="ms" aria-hidden="true">groups</i>YOU’RE ON THE TEAM</span
                >
                <span class="panel-title" id="seat-h">Welcome aboard, {{ seat.roleTitle }}!</span>
                <span class="muted sm"
                  >Your interview scored {{ a.interview?.overallScore }}/100. Your seat is confirmed, and the AI PM and
                  your teammates are waiting in the workspace.</span
                >
                <a
                  class="btn btn-primary"
                  style="align-self:flex-start"
                  [routerLink]="['/projects', seat.projectSlug, 'workspace']"
                  ><i class="ms" aria-hidden="true">rocket_launch</i>Open the workspace</a
                >
              </section>
            }

            <!-- CV screening -->
            @if (a.screening; as s) {
              <section class="panel pad-lg" aria-labelledby="ats-h">
                <div style="display:flex;align-items:center;gap:8px">
                  <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI CV SCREENING</span>
                  @if (a.cv) {
                    <button type="button" class="link-btn" style="margin-left:auto" (click)="downloadCv()">
                      <i class="ms" aria-hidden="true" style="font-size:15px">download</i>{{ a.cv.fileName }}
                    </button>
                  }
                </div>
                @switch (s.status) {
                  @case ('PENDING') {
                    <div style="display:flex;gap:10px;align-items:center" aria-live="polite">
                      <span class="spinner" aria-hidden="true"></span>
                      <span class="sm">Reading your CV and scoring it against the {{ a.role.title }} role…</span>
                    </div>
                  }
                  @case ('FAILED') {
                    <div class="banner danger">
                      <i class="ms" aria-hidden="true">sync_problem</i><span class="grow">{{ s.failureMessage }}</span>
                      <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="retryScreening()">
                        Try again
                      </button>
                    </div>
                  }
                  @case ('DONE') {
                    <div class="ats">
                      <div
                        class="ats-score"
                        [class.pass]="s.atsScore! >= s.passScore"
                        role="img"
                        [attr.aria-label]="'ATS score ' + s.atsScore + ' out of 100'"
                      >
                        <span class="n">{{ s.atsScore }}</span
                        ><span class="of">/100</span>
                      </div>
                      <div style="display:flex;flex-direction:column;gap:4px;min-width:0">
                        <span class="panel-title" id="ats-h">{{
                          s.atsScore! >= s.passScore
                            ? 'Your CV passed: interview unlocked'
                            : 'Below the ' + s.passScore + ' needed for an interview'
                        }}</span>
                        <span class="muted sm">{{ s.feedback }}</span>
                      </div>
                    </div>
                    <div class="ats-bars">
                      @for (b of s.breakdown; track b.label) {
                        <div class="ats-bar">
                          <span class="l"
                            >{{ b.label }} <span class="faint">· {{ b.weight * 100 }}%</span></span
                          >
                          <span class="track"><span [style.width.%]="b.score"></span></span>
                          <span class="mono v">{{ b.score }}</span>
                        </div>
                      }
                    </div>
                    @if (s.matchedSkills.length || s.missingSkills.length) {
                      <div class="chips">
                        @for (m of s.matchedSkills; track m) {
                          <span class="chip match"><i class="ms" aria-hidden="true">check</i>{{ m }}</span>
                        }
                        @for (m of s.missingSkills; track m) {
                          <span class="chip miss"><i class="ms" aria-hidden="true">close</i>{{ m }}</span>
                        }
                      </div>
                    }
                  }
                }
              </section>
            }

            <!-- Booking / live / evaluating -->
            @if (a.interview; as iv) {
              @if (iv.status === 'AWAITING_SCHEDULE' || iv.status === 'SCHEDULED') {
                @if (a.status === 'INTERVIEW_PENDING') {
                  <sb-interview-booking
                    [interviewId]="iv.id"
                    [applicationId]="a.id"
                    [scheduledFor]="iv.scheduledFor"
                    [canJoin]="joinable()"
                    (changed)="load()"
                  />
                }
              } @else if (iv.status === 'LIVE') {
                <section class="ai-frame booking">
                  <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI VOICE INTERVIEW</span>
                  <span class="booking-title">Your interview is in progress</span>
                  <a
                    class="btn btn-primary"
                    style="align-self:flex-start"
                    [routerLink]="['/applications', a.id, 'interview']"
                    ><i class="ms" aria-hidden="true">call</i>Rejoin interview</a
                  >
                </section>
              } @else if (iv.status === 'SUBMITTED') {
                <section class="ai-frame booking" aria-live="polite">
                  <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>EVALUATING</span>
                  <div style="display:flex;gap:10px;align-items:center">
                    <span class="spinner" aria-hidden="true"></span
                    ><span class="sm">The AI is writing your evaluation. This usually takes under a minute.</span>
                  </div>
                </section>
              } @else if (iv.status === 'FAILED') {
                <div class="banner danger">
                  <i class="ms" aria-hidden="true">sync_problem</i
                  ><span class="grow">We couldn’t finish your evaluation. Your answers are saved.</span>
                  <button
                    type="button"
                    class="btn btn-secondary xs"
                    [disabled]="busy()"
                    (click)="retryEvaluation(iv.id)"
                  >
                    Retry
                  </button>
                </div>
              } @else if (iv.status === 'EVALUATED') {
                <section class="panel pad-lg" style="flex-direction:row;align-items:center;gap:12px;flex-wrap:wrap">
                  <span class="ai-diamond" aria-hidden="true"></span>
                  <span class="grow"
                    ><b>Interview score {{ iv.overallScore }}/100</b>
                    <span class="muted">
                      ({{ passMark }} needed for a seat). Read the full feedback and transcript.</span
                    ></span
                  >
                  <a class="btn btn-secondary" [routerLink]="['/applications', a.id, 'interview']">View feedback</a>
                </section>
              }
            }

            <!-- Outcome: next steps -->
            @if (a.outcome; as o) {
              <section class="panel pad-lg" aria-labelledby="out-h">
                <span class="panel-title" id="out-h"
                  ><i class="ms" aria-hidden="true" style="vertical-align:-4px;color:var(--ink-3)">{{
                    reason(o.reason).icon
                  }}</i>
                  {{ reason(o.reason).title }}</span
                >
                @if (o.feedback) {
                  <p class="sm" style="line-height:1.6">{{ o.feedback }}</p>
                }
                @if (o.courses.length) {
                  <span class="section-label">COURSES THAT COVER WHAT WAS MISSING</span>
                  @for (c of o.courses; track c.slug) {
                    <a class="next-row" [routerLink]="['/learn/courses', c.slug]">
                      <i class="ms" aria-hidden="true">school</i>
                      <span class="grow"
                        ><b>{{ c.title }}</b> <span class="faint">· {{ c.reason }}</span></span
                      >
                      <i class="ms" aria-hidden="true">chevron_right</i>
                    </a>
                  }
                }
                @if (o.projects.length) {
                  <span class="section-label">OPEN PROJECTS WITH A {{ a.role.title.toUpperCase() }} SEAT</span>
                  @for (p of o.projects; track p.slug) {
                    <a class="next-row" [routerLink]="['/projects', p.slug]">
                      <i class="ms" aria-hidden="true">deployed_code</i>
                      <span class="grow"
                        ><b>{{ p.title }}</b> <span class="faint">· {{ p.roleTitle }} · {{ p.open }} open</span></span
                      >
                      <i class="ms" aria-hidden="true">chevron_right</i>
                    </a>
                  }
                } @else if (o.reason === 'ROLE_FILLED') {
                  <span class="faint sm"
                    >No other open project has this role free right now.
                    <a routerLink="/projects">Browse all projects</a>.</span
                  >
                }
              </section>
            }

            <section class="panel pad-lg">
              <span class="panel-title">What you sent</span>
              <span class="section-label">MOTIVATION</span>
              <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">{{ a.motivation }}</p>
              @if (a.relevantExperience) {
                <span class="section-label">RELEVANT EXPERIENCE</span>
                <p style="font-size:14px;line-height:1.6;white-space:pre-wrap">{{ a.relevantExperience }}</p>
              }
              <span class="section-label">AVAILABILITY</span>
              <p style="font-size:14px">{{ a.availabilityHoursPerWeek }} hours a week</p>
            </section>
          </div>

          <aside class="panel pad-lg enroll-card">
            <span class="panel-title">Progress</span>
            <div class="timeline">
              @for (s of stages; track s.id; let i = $index) {
                <div class="timeline-step" [class.future]="i > stageIndex()">
                  <span
                    class="timeline-dot"
                    [class.done]="i < stageIndex() || (i === stageIndex() && finished())"
                    [class.current]="i === stageIndex() && !finished()"
                    aria-hidden="true"
                  ></span>
                  <span class="t">{{ s.t }}</span>
                </div>
              }
            </div>
            <span class="section-label">HISTORY</span>
            @for (h of a.history; track h.at) {
              <div style="display:flex;gap:8px;font-size:12.5px">
                <span class="grow">{{ statusLabel(h.status) }}</span
                ><span class="faint mono" style="font-size:11px">{{ longDate(h.at) }}</span>
              </div>
            }
            @if (canWithdraw()) {
              <button
                type="button"
                class="btn btn-ghost block"
                style="color:var(--danger);margin-top:8px"
                [disabled]="busy()"
                (click)="withdraw()"
              >
                <i class="ms" aria-hidden="true">undo</i>Withdraw application
              </button>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class ApplicationDetailPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly id = input.required<string>();
  readonly app = signal<ApplicationView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal(false);
  readonly joinable = signal(false);
  readonly stages = STAGES;
  readonly longDate = longDate;
  readonly passMark = INTERVIEW_PASS_SCORE;
  private timer: ReturnType<typeof setTimeout> | undefined;

  readonly view = computed(() => APPLICATION_STATUS[this.app()!.status]);
  readonly canWithdraw = computed(() => WITHDRAWABLE.includes(this.app()!.status));
  readonly statusLabel = (s: ApplicationStatus) => APPLICATION_STATUS[s].label;
  readonly reason = (r: string) => REASON[r] ?? { title: 'Next steps', icon: 'info' };

  /** Where the application is in the five stages. */
  readonly stageIndex = computed(() => {
    const a = this.app()!;
    if (a.seat) return 4;
    if (a.interview && ['SUBMITTED', 'EVALUATED', 'FAILED'].includes(a.interview.status)) return 3;
    if (a.interview) return 2;
    if (a.screening?.status === 'DONE') return 1;
    return a.screening ? 1 : 0;
  });
  readonly finished = computed(() => {
    const a = this.app()!;
    return !!a.seat || a.status === 'REJECTED' || a.status === 'WITHDRAWN';
  });

  constructor() {
    effect(() => {
      this.id();
      untracked(() => void this.load());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  async load() {
    clearTimeout(this.timer);
    this.error.set(null);
    try {
      const a = await this.api.application(this.id());
      this.app.set(a);
      if (a.interview?.status === 'SCHEDULED') {
        const iv = await this.api.interviewForApplication(a.id);
        this.joinable.set(iv.canJoin);
      }
      // Background work in progress: keep the page fresh.
      const working =
        a.screening?.status === 'PENDING' || a.interview?.status === 'SUBMITTED' || a.status === 'UNDER_REVIEW';
      const waitingForSlot = a.interview?.status === 'SCHEDULED' && !this.joinable();
      if (working || waitingForSlot) this.timer = setTimeout(() => void this.load(), working ? 2500 : 30_000);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  async downloadCv() {
    const a = this.app();
    if (!a?.cv) return;
    try {
      const blob = await this.api.downloadCv(a.id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = a.cv.fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async retryScreening() {
    this.busy.set(true);
    try {
      this.app.set(await this.api.retryScreening(this.id()));
      void this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async retryEvaluation(interviewId: string) {
    this.busy.set(true);
    try {
      await this.api.retryInterview(interviewId);
      void this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async withdraw() {
    if (!confirm('Withdraw this application? You can apply again later while the project is recruiting.')) return;
    this.busy.set(true);
    try {
      this.app.set(await this.api.withdrawApplication(this.id()));
      this.toast.ok('Application withdrawn.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
