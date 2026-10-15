import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProfileSkill, ProjectDetail, TeamView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { APPLICATION_STATUS, levelBars, levelLabel, longDate } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { LevelBadgeComponent } from '../../ui/level-badge.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { projectStatus, seatArray } from './project-status';

/** Project detail (new screen in the Projects visual language). */
@Component({
  selector: 'sb-project-detail-page',
  imports: [RouterLink, TopbarComponent, AvatarComponent, LevelBadgeComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/projects">Projects</a><i class="ms" aria-hidden="true">chevron_right</i>
        <b class="ellipsis">{{ project()?.title ?? 'Project' }}</b>
      </nav>
    </sb-topbar>
    <div class="page">
      @if (error()) {
        <sb-error-state
          [title]="error()!.status === 404 ? 'Project not found' : 'This project didn’t load'"
          [error]="error()"
          (retry)="load()"
        />
      } @else if (!project()) {
        <sb-skeleton [rows]="6" [height]="20" />
      } @else {
        @let p = project()!;
        <div class="detail-grid">
          <div style="display:flex;flex-direction:column;gap:20px;min-width:0">
            <div class="detail-hero">
              <span class="build-eyebrow"><span class="sq" aria-hidden="true"></span>{{ p.category }}</span>
              <h1>{{ p.title }}</h1>
              <p class="sum">{{ p.summary }}</p>
              <div class="detail-meta">
                <sb-level-badge [level]="p.difficulty" />
                <span class="p-status" [class]="'p-status ' + status().cls"
                  ><span class="dot" aria-hidden="true"></span>{{ status().label }}</span
                >
                <span><i class="ms" aria-hidden="true">calendar_month</i>{{ p.durationWeeks }} weeks</span>
                <span><i class="ms" aria-hidden="true">groups</i>Team of {{ p.teamSize }}</span>
                @if (p.startsAt) {
                  <span><i class="ms" aria-hidden="true">flag</i>{{ startedLabel(p.startsAt) }}</span>
                }
              </div>
            </div>

            <section class="panel pad-lg" aria-labelledby="problem-h">
              <span class="panel-title" id="problem-h">The problem</span>
              <p style="font-size:14px;line-height:1.6">{{ p.problem }}</p>
              <span class="section-label">WHAT YOU’LL BUILD</span>
              <p style="font-size:14px;line-height:1.6;color:var(--ink-2)">{{ p.description }}</p>
              <span class="section-label">TECH STACK</span>
              <div class="chips">
                @for (s of p.techStack; track s.id) {
                  @if (mySkillIds().has(s.id)) {
                    <span class="chip match"
                      ><i class="ms" aria-hidden="true">check</i>{{ s.name
                      }}<span class="sr-only">(you have this)</span></span
                    >
                  } @else {
                    <span class="chip">{{ s.name }}</span>
                  }
                }
              </div>
            </section>

            <section class="panel pad-lg" aria-labelledby="roles-h">
              <div class="panel-head">
                <span class="panel-title" id="roles-h">Roles</span>
                <span class="faint sm" style="margin-left:auto"
                  >Green = you have it at the level needed · dashed = a gap</span
                >
              </div>
              @for (r of p.roles; track r.id) {
                <div class="role-card">
                  <div class="head">
                    <span class="title grow">{{ r.title }}</span>
                    <span class="seats" [attr.aria-label]="r.open + ' of ' + r.seats + ' seats open'">
                      @for (f of seats(r.seats, r.open); track $index) {
                        <span [class.filled]="f"></span>
                      }
                    </span>
                    <span class="faint sm">{{ r.open }} of {{ r.seats }} open</span>
                  </div>
                  <span class="desc">{{ r.description }}</span>
                  <div class="chips">
                    @for (s of r.requiredSkills; track s.id) {
                      @if (meets(s.id, s.minLevel)) {
                        <span class="req-skill have"
                          ><i class="ms" aria-hidden="true">check</i>{{ s.name }} · {{ levelLabel(s.minLevel) }}+</span
                        >
                      } @else {
                        <span class="req-skill gap"
                          ><span class="sr-only">Gap: </span>{{ s.name }} · {{ levelLabel(s.minLevel) }}+</span
                        >
                      }
                    }
                  </div>
                </div>
              }
            </section>

            @if (team(); as t) {
              <section class="panel pad-lg" aria-labelledby="team-h">
                <div class="panel-head">
                  <span class="panel-title" id="team-h">Team</span>
                  <span class="faint sm" style="margin-left:auto"
                    >{{ t.members.length }} of {{ p.teamSize }} seats taken</span
                  >
                </div>
                <div class="team-list">
                  @for (m of t.members; track m.id) {
                    <a class="team-row" [routerLink]="['/u', m.user.username]" style="color:var(--ink)">
                      <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [src]="m.user.avatarUrl" />
                      <span class="grow" style="font-weight:500">{{ m.user.displayName }}</span>
                      <span class="muted">{{ m.role.title }}</span>
                      @if (m.status === 'INVITED') {
                        <span class="status warn"><i class="ms" aria-hidden="true">hourglass_top</i>Invited</span>
                      } @else {
                        <span class="status ok"><i class="ms" aria-hidden="true">check_circle</i>On the team</span>
                      }
                    </a>
                  }
                </div>
              </section>
            }
          </div>

          <aside class="panel pad-lg enroll-card" aria-labelledby="apply-h">
            @if (isOnTeam() || auth.user()?.role === 'ADMIN') {
              <a class="btn btn-primary block" [routerLink]="['/projects', p.slug, 'workspace']"
                ><i class="ms" aria-hidden="true">dashboard</i>Open workspace</a
              >
            }
            @if (auth.user()?.role === 'ADMIN') {
              <a class="btn btn-secondary block" [routerLink]="['/projects', p.slug, 'selection']"
                ><i class="ms" aria-hidden="true">groups</i>Team selection (admin)</a
              >
            }
            @if (p.myApplication; as a) {
              <span class="eyebrow" id="apply-h">YOUR APPLICATION</span>
              <span style="font-size:14px;font-weight:600">{{ a.roleTitle }}</span>
              <span class="status" [class]="'status ' + statusOf(a.status).tone" style="font-size:13px">
                <i class="ms" aria-hidden="true">{{ statusOf(a.status).icon }}</i
                >{{ statusOf(a.status).label }}
              </span>
              <a class="btn btn-primary lg block" [routerLink]="['/applications', a.id]">View application</a>
            } @else if (p.status !== 'OPEN') {
              <span class="panel-title" id="apply-h">Not recruiting</span>
              <p class="muted sm">
                This team is already {{ p.status === 'IN_PROGRESS' ? 'building' : 'finished' }}. Browse projects that
                are recruiting now.
              </p>
              <a class="btn btn-secondary block" routerLink="/projects">Browse projects</a>
            } @else {
              <span class="panel-title" id="apply-h">Apply for a role</span>
              @if (p.applicationDeadline) {
                <span class="faint sm"
                  ><i class="ms" aria-hidden="true" style="font-size:15px">schedule</i> Applications close
                  {{ longDate(p.applicationDeadline) }}</span
                >
              }
              <div class="timeline">
                @for (s of process; track s.t; let i = $index) {
                  <div class="timeline-step" [class.future]="i > 0">
                    <span class="timeline-dot" [class.current]="i === 0" aria-hidden="true"></span>
                    <div style="display:flex;flex-direction:column">
                      <span class="t">{{ s.t }}</span
                      ><span class="d">{{ s.d }}</span>
                    </div>
                  </div>
                }
              </div>
              @if (!auth.user()?.emailVerified) {
                <div class="banner warn" style="font-size:12.5px;flex-wrap:wrap">
                  <i class="ms" aria-hidden="true">mark_email_unread</i>
                  <span class="grow">Confirm your email before applying. Interviews are limited per person.</span>
                  <button type="button" class="link-strong" [disabled]="resending()" (click)="resend()">
                    Resend link
                  </button>
                </div>
              }
              <a
                class="btn btn-primary lg block"
                [class.disabled]="!auth.user()?.emailVerified"
                [attr.aria-disabled]="!auth.user()?.emailVerified"
                [routerLink]="auth.user()?.emailVerified ? ['/projects', p.slug, 'apply'] : null"
              >
                Apply<i class="ms" aria-hidden="true">arrow_forward</i>
              </a>
              <span class="faint sm" style="text-align:center">{{ p.applicantCount }} applied so far</span>
            }
          </aside>
        </div>
      }
    </div>
  `,
})
export class ProjectDetailPage {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  readonly project = signal<ProjectDetail | null>(null);
  readonly mySkills = signal<ProfileSkill[]>([]);
  readonly error = signal<ApiError | null>(null);
  readonly resending = signal(false);
  readonly team = signal<TeamView | null>(null);
  readonly isOnTeam = computed(
    () => !!this.team()?.members.some((m) => m.user.id === this.auth.user()?.id && m.status === 'ACTIVE'),
  );

  readonly status = computed(() => projectStatus(this.project()!));
  readonly mySkillIds = computed(() => new Set(this.mySkills().map((s) => s.skillId)));
  readonly levelLabel = levelLabel;
  readonly longDate = longDate;
  readonly seats = seatArray;
  readonly statusOf = (s: keyof typeof APPLICATION_STATUS) => APPLICATION_STATUS[s];
  readonly process = [
    { t: 'Apply', d: 'About 5 minutes. Your profile fills in the rest.' },
    { t: 'AI interview', d: 'Role-specific questions, about 25 minutes' },
    { t: 'Evaluation', d: 'Written feedback either way' },
    { t: 'Team selection', d: 'Balanced for skill coverage' },
  ];

  constructor() {
    effect(() => {
      this.slug();
      untracked(() => void this.load());
    });
  }

  /** True when any of the user's skills (claimed or proven) meets the role's minimum level. */
  meets(skillId: string, min: ProfileSkill['level']) {
    return this.mySkills().some((s) => s.skillId === skillId && levelBars(s.level) >= levelBars(min));
  }

  startedLabel(iso: string) {
    return new Date(iso) < new Date() ? `Started ${longDate(iso)}` : `Starts ${longDate(iso)}`;
  }

  async load() {
    this.error.set(null);
    this.project.set(null);
    try {
      const [p, skills] = await Promise.all([this.api.project(this.slug()), this.api.mySkills()]);
      this.project.set(p);
      this.mySkills.set(skills);
      // A team exists once selection has been applied; 404 just means "not yet".
      this.team.set(await this.api.projectTeam(this.slug()).catch(() => null));
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  async resend() {
    this.resending.set(true);
    try {
      await this.api.resendVerification();
      this.toast.ok('We sent you a new confirmation link.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.resending.set(false);
    }
  }
}
