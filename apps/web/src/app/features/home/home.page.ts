import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ApplicationView, LearningStats } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { APPLICATION_STATUS, greeting, levelLabel } from '../../core/format';
import { LearningStore } from '../../core/learning.store';
import { TeamsStore } from '../../core/teams.store';
import { asyncState } from '../../core/resource';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

/** Screen 14 · Home. Feed arrives with the social milestone; everything shown here is live data. */
@Component({
  selector: 'sb-home-page',
  imports: [RouterLink, TopbarComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Home</span>
      <div class="topbar-end">
        <a class="btn btn-secondary" routerLink="/learn/discover"><i class="ms" aria-hidden="true">add</i>New course</a>
      </div>
    </sb-topbar>
    <div class="page narrow">
      <div style="display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:24px;align-items:start" class="home-grid">
        <div style="display:flex;flex-direction:column;gap:14px;min-width:0">
          <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
            <h1 class="display" style="font-size:28px">{{ greeting }}, {{ firstName() }}</h1>
            <span class="muted" style="font-size:13.5px">{{ subline() }}</span>
          </div>

          @if (!auth.user()?.emailVerified) {
            <div class="banner warn">
              <i class="ms" aria-hidden="true">mark_email_unread</i>
              <span class="grow">Confirm your email address so you can apply to projects.</span>
              <a class="link-strong" routerLink="/settings" fragment="account">Settings</a>
            </div>
          }

          <section class="panel" aria-labelledby="cont-h">
            <div class="panel-head">
              <span class="panel-title" id="cont-h">Continue learning</span>
              <a class="link-strong" routerLink="/learn">My Learning</a>
            </div>
            @if (store.error() && !store.data()) {
              <sb-error-state [error]="store.error()" (retry)="store.load()" />
            } @else if (!store.data()) {
              <sb-skeleton [rows]="3" />
            } @else {
              @for (e of store.active(); track e.id) {
                <a
                  [routerLink]="['/learn/courses', e.course.slug]"
                  style="display:flex;align-items:center;gap:14px;padding:10px 0;border-top:1px solid var(--line-soft);color:var(--ink)"
                >
                  <span
                    style="width:40px;height:40px;border-radius:8px;background:var(--brand-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0"
                  >
                    <span style="width:12px;height:12px;border-radius:50%;background:var(--brand)"></span>
                  </span>
                  <span style="display:flex;flex-direction:column;gap:2px;flex:1;min-width:0">
                    <span style="font-weight:600"
                      >{{ e.course.title }}
                      <span class="faint" style="font-weight:400;font-size:12.5px">{{
                        levelLabel(e.level)
                      }}</span></span
                    >
                    <span class="muted ellipsis" style="font-size:12.5px">{{
                      e.nextLesson
                        ? 'Next: ' + e.nextLesson.label + ' ' + e.nextLesson.title
                        : 'All lessons done — ready to complete'
                    }}</span>
                  </span>
                  <span class="mono" style="font-size:12px">{{ e.progress }}%</span>
                  <i class="ms" aria-hidden="true" style="color:var(--ink-3)">chevron_right</i>
                </a>
              } @empty {
                <div class="empty dashed" style="padding:20px">
                  <span class="empty-title">No Study Buddy yet</span>
                  <span class="empty-text"
                    >Start a course at your level. Matching you with a partner learning the same thing is next on our
                    list.</span
                  >
                  <a class="btn btn-primary" routerLink="/learn/discover">Find a course</a>
                </div>
              }
            }
          </section>

          <section class="panel" aria-labelledby="apps-h">
            <div class="panel-head">
              <span class="panel-title" id="apps-h">Your applications</span>
              <a class="link-strong" routerLink="/projects">Projects</a>
            </div>
            @if (apps.error()) {
              <sb-error-state [error]="apps.error()" (retry)="apps.reload()" />
            } @else if (apps.value()) {
              @let list = apps.value()!;
              @for (a of list.slice(0, 4); track a.id) {
                <a
                  [routerLink]="['/applications', a.id]"
                  style="display:flex;align-items:center;gap:12px;padding:10px 0;border-top:1px solid var(--line-soft);color:var(--ink)"
                >
                  <span
                    style="width:10px;height:10px;border-radius:2px;background:var(--ai);flex-shrink:0"
                    aria-hidden="true"
                  ></span>
                  <span style="display:flex;flex-direction:column;flex:1;min-width:0">
                    <span style="font-weight:600" class="ellipsis">{{ a.project.title }}</span>
                    <span class="muted" style="font-size:12.5px">{{ a.role.title }}</span>
                  </span>
                  <span class="status" [class]="'status ' + statusOf(a).tone"
                    ><i class="ms" aria-hidden="true">{{ statusOf(a).icon }}</i
                    >{{ statusOf(a).label }}</span
                  >
                </a>
              } @empty {
                <span class="faint sm"
                  >Turn what you learn into experience. <a routerLink="/projects">Browse team projects</a>.</span
                >
              }
            } @else {
              <sb-skeleton [rows]="2" />
            }
          </section>

          <section class="empty dashed" aria-label="Feed">
            <span class="eyebrow">FEED · COMING WITH THE SOCIAL NETWORK</span>
            <span class="empty-text"
              >Posts, achievements and project milestones from people you follow will show up here.</span
            >
          </section>
        </div>

        <aside style="display:flex;flex-direction:column;gap:14px">
          <section class="panel sm" aria-labelledby="cur-h">
            <div class="panel-head">
              <span class="panel-title" style="font-size:14px" id="cur-h">Current learning</span>
              <span class="mono faint" style="margin-left:auto;font-size:11.5px"
                >{{ store.active().length }} / {{ store.maxActive() }} slots</span
              >
            </div>
            @for (e of store.active(); track e.id) {
              <a [routerLink]="['/learn/courses', e.course.slug]" class="course-line" style="color:var(--ink)">
                <div class="top" style="font-size:13px">
                  <span style="font-weight:500">{{ e.course.title }}</span
                  ><span class="faint" style="font-size:12px">{{ levelLabel(e.level) }}</span
                  ><span class="mono">{{ e.progress }}%</span>
                </div>
                <div class="progress-track thin"><div [style.width.%]="e.progress"></div></div>
              </a>
            } @empty {
              <span class="faint sm">No active courses.</span>
            }
          </section>

          <section class="panel sm" aria-labelledby="proj-h">
            <div class="panel-head">
              <span style="width:8px;height:8px;border-radius:2px;background:var(--ai)" aria-hidden="true"></span>
              <span class="panel-title" style="font-size:14px" id="proj-h">Active project</span>
            </div>
            @for (m of teams.memberships(); track m.memberId) {
              <a
                [routerLink]="['/projects', m.project.slug]"
                style="display:flex;flex-direction:column;gap:2px;color:var(--ink)"
              >
                <span style="font-size:13.5px;font-weight:500">{{ m.project.title }}</span>
                <span class="muted" style="font-size:12px">{{ m.role.title }}</span>
                @if (m.status === 'INVITED') {
                  <span class="status warn"
                    ><i class="ms" aria-hidden="true">mail</i>Invitation waiting for your answer</span
                  >
                }
              </a>
            } @empty {
              <span class="faint sm">You’re not on a team yet. Teams form after interviews and selection.</span>
            }
          </section>

          @if (stats.value(); as s) {
            @if (s.streakDays > 0) {
              <section class="panel sm" style="flex-direction:row;align-items:center;gap:12px">
                <span
                  style="width:40px;height:40px;border-radius:8px;background:var(--grow-soft);display:flex;align-items:center;justify-content:center;flex-shrink:0"
                >
                  <i class="ms" aria-hidden="true" style="color:var(--warn)">local_fire_department</i>
                </span>
                <span style="display:flex;flex-direction:column;gap:2px">
                  <span class="eyebrow">STUDY STREAK</span>
                  <span style="font-size:13.5px;font-weight:600">{{ s.streakDays }}-day streak</span>
                  <span class="muted" style="font-size:12px"
                    >{{ s.thisMonth.lessonsCompleted }} lessons this month</span
                  >
                </span>
              </section>
            }
          }
        </aside>
      </div>
    </div>
  `,
  styles: ['@media (max-width: 1100px) { .home-grid { grid-template-columns: minmax(0,1fr) !important; } }'],
})
export class HomePage {
  readonly auth = inject(AuthService);
  readonly store = inject(LearningStore);
  readonly teams = inject(TeamsStore);
  private readonly api = inject(Api);

  readonly apps = asyncState<ApplicationView[]>(() => this.api.myApplications());
  readonly stats = asyncState<LearningStats>(() => this.api.learningStats());
  readonly greeting = greeting();
  readonly levelLabel = levelLabel;
  readonly statusOf = (a: ApplicationView) => APPLICATION_STATUS[a.status];

  readonly firstName = computed(() => this.auth.user()?.displayName.split(' ')[0] ?? '');
  readonly subline = computed(() => {
    const n = this.store.active().length;
    const s = this.stats.value();
    if (!this.store.data()) return '';
    const parts = [n ? `${n} course${n === 1 ? '' : 's'} in progress` : 'No courses in progress'];
    if (s?.streakDays) parts.push(`a ${s.streakDays}-day streak`);
    return parts.join(' and ');
  });
}
