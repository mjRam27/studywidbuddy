import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Profile, ProfileSkill } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { levelLabel, longDate } from '../../core/format';
import { TopbarComponent } from '../../layout/topbar.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { LevelBarsComponent } from '../../ui/level-badge.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

type Tab = 'overview' | 'learning' | 'projects' | 'certificates';

interface SkillLine {
  skillId: string;
  name: string;
  level: ProfileSkill['level'];
  proven: boolean;
}

/** Screen 43 · User profile. Visibility is enforced by the API (a hidden profile is a 404). */
@Component({
  selector: 'sb-profile-page',
  imports: [RouterLink, TopbarComponent, AvatarComponent, LevelBarsComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <span>People</span><i class="ms" aria-hidden="true">chevron_right</i>
        <b class="ellipsis">{{ profile()?.displayName ?? '@' + username() }}</b>
      </nav>
    </sb-topbar>
    <div class="page narrow">
      @if (error()) {
        <sb-error-state
          [title]="error()!.status === 404 ? 'This profile isn’t available' : 'This profile didn’t load'"
          [error]="error()"
          (retry)="load()"
        />
      } @else if (!profile()) {
        <sb-skeleton [rows]="6" [height]="20" />
      } @else {
        @let p = profile()!;
        <div class="profile-layout">
          <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
            <section class="profile-card" aria-labelledby="profile-name">
              <div class="profile-band">
                <div class="counts" aria-hidden="true">
                  <span
                    ><span style="width:7px;height:7px;border-radius:50%;background:#8186FF"></span
                    >{{ p.learning.active.length + p.learning.completed.length }} COURSES</span
                  >
                  <span><span style="width:7px;height:7px;border-radius:1px;background:#4CC9E6"></span>0 PROJECTS</span>
                  <span
                    ><span
                      style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:7px solid #FBBF24"
                    ></span
                    >0 CERTIFICATES</span
                  >
                </div>
              </div>
              <div class="profile-body">
                <div class="profile-top">
                  <sb-avatar
                    [name]="p.displayName"
                    [src]="p.avatarUrl"
                    [size]="88"
                    [self]="p.isSelf"
                    [colorKey]="p.userId"
                  />
                  <div class="profile-actions">
                    @if (p.isSelf) {
                      <a class="btn btn-secondary" routerLink="/settings"
                        ><i class="ms" aria-hidden="true">edit</i>Edit profile</a
                      >
                      <a class="btn btn-secondary" routerLink="/settings" fragment="visibility"
                        ><i class="ms" aria-hidden="true">{{ visibilityIcon() }}</i
                        >{{ visibilityLabel() }}</a
                      >
                    } @else {
                      <button
                        type="button"
                        class="btn btn-primary"
                        disabled
                        title="Connections arrive with the social network"
                      >
                        <i class="ms" aria-hidden="true">person_add</i>Connect
                      </button>
                      <button
                        type="button"
                        class="btn btn-secondary"
                        disabled
                        title="Messaging arrives with realtime collaboration"
                      >
                        <i class="ms" aria-hidden="true">chat_bubble</i>Message
                      </button>
                    }
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px">
                  <div class="profile-name">
                    <h1 id="profile-name">{{ p.displayName }}</h1>
                    <span>&#64;{{ p.username }}</span>
                  </div>
                  @if (p.headline) {
                    <span class="profile-headline">{{ p.headline }}</span>
                  }
                  <span class="profile-meta">
                    @if (p.location) {
                      <span><i class="ms" aria-hidden="true">location_on</i>{{ p.location }}</span>
                    }
                    @if (p.languages.length) {
                      <span><i class="ms" aria-hidden="true">translate</i>{{ p.languages.join(', ') }}</span>
                    }
                    @if (p.timezone) {
                      <span><i class="ms" aria-hidden="true">public</i>{{ p.timezone }}</span>
                    }
                    <span>Member since {{ memberSince() }}</span>
                  </span>
                </div>
                @if (p.bio) {
                  <p class="profile-bio">{{ p.bio }}</p>
                } @else if (p.isSelf) {
                  <p class="faint sm">
                    No bio yet. <a routerLink="/settings">Add a few lines</a> about what you’re learning and building.
                  </p>
                }
              </div>
              <div class="profile-tabs" role="tablist">
                @for (t of tabs; track t.id) {
                  <button
                    type="button"
                    role="tab"
                    class="tab"
                    [class.on]="tab() === t.id"
                    [attr.aria-selected]="tab() === t.id"
                    (click)="tab.set(t.id)"
                  >
                    {{ t.label }}<span class="count">{{ countFor(t.id) }}</span>
                  </button>
                }
              </div>
            </section>

            @switch (tab()) {
              @case ('overview') {
                <section class="panel pad-lg" aria-labelledby="skills-h">
                  <div class="panel-head">
                    <span class="panel-title" id="skills-h">Skills</span>
                    <span class="faint" style="margin-left:auto;font-size:12px"
                      >Bars show level. “Proven” means a finished course or project backs it up.</span
                    >
                  </div>
                  <div class="skills-grid">
                    @for (s of skills(); track s.skillId) {
                      <div class="skill-row">
                        <span class="n ellipsis">{{ s.name }}</span>
                        <sb-level-bars [level]="s.level" />
                        <span class="lv">{{ levelLabel(s.level) }}</span>
                        @if (s.proven) {
                          <span class="proof proven"><i class="ms" aria-hidden="true">verified</i>Proven</span>
                        } @else {
                          <span class="proof self"><i class="ms" aria-hidden="true">person</i>Self-reported</span>
                        }
                      </div>
                    } @empty {
                      <span class="faint sm">{{
                        p.isSelf
                          ? 'Add skills in Settings so the right projects and people find you.'
                          : 'No skills listed yet.'
                      }}</span>
                    }
                  </div>
                </section>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px">
                  <section class="panel pad-lg" aria-labelledby="cur-h">
                    <span class="panel-title" id="cur-h">Currently learning</span>
                    @for (c of p.learning.active; track c.courseSlug) {
                      <div class="course-line">
                        <div class="top">
                          <span style="font-weight:500">{{ c.title }}</span
                          ><span class="faint sm">{{ levelLabel(c.level) }}</span
                          ><span class="mono">{{ c.progress }}%</span>
                        </div>
                        <div class="progress-track thin"><div [style.width.%]="c.progress"></div></div>
                      </div>
                    } @empty {
                      <span class="faint sm">Not taking a course right now.</span>
                    }
                    @if (p.learning.completed.length) {
                      <span class="section-label" style="margin-top:6px">COMPLETED</span>
                      @for (c of p.learning.completed; track c.courseSlug + c.completedAt) {
                        <div style="display:flex;align-items:center;gap:8px;font-size:13.5px">
                          <i class="ms" aria-hidden="true" style="font-size:17px;color:var(--success)">check_circle</i
                          >{{ c.title }}
                          <span class="faint" style="margin-left:auto;font-size:12px">{{
                            monthYear(c.completedAt)
                          }}</span>
                        </div>
                      }
                    }
                  </section>
                  <section class="panel pad-lg" aria-labelledby="proj-h">
                    <span class="panel-title" id="proj-h">Project experience</span>
                    <span class="faint sm"
                      >Completed team projects appear here with the role, tasks and pull requests behind them.</span
                    >
                  </section>
                </div>
              }
              @case ('learning') {
                <div class="learning-table" role="table" aria-label="Courses">
                  <div class="row head" role="row">
                    <span role="columnheader">COURSE</span><span role="columnheader">LEVEL</span
                    ><span role="columnheader">PROGRESS</span><span role="columnheader">STATUS</span>
                  </div>
                  @for (c of p.learning.active; track c.courseSlug) {
                    <div class="row" role="row">
                      <span role="cell" style="font-weight:500">{{ c.title }}</span>
                      <span role="cell" class="muted">{{ levelLabel(c.level) }}</span>
                      <span role="cell" style="display:flex;align-items:center;gap:8px">
                        <span class="progress-track thin"><div [style.width.%]="c.progress"></div></span
                        ><span class="mono" style="font-size:11.5px">{{ c.progress }}%</span>
                      </span>
                      <span role="cell" class="status info"
                        ><i class="ms" aria-hidden="true">play_circle</i>Active</span
                      >
                    </div>
                  }
                  @for (c of p.learning.completed; track c.courseSlug + c.completedAt) {
                    <div class="row" role="row">
                      <span role="cell" style="font-weight:500">{{ c.title }}</span>
                      <span role="cell" class="muted">{{ levelLabel(c.level) }}</span>
                      <span role="cell" style="display:flex;align-items:center;gap:8px">
                        <span class="progress-track thin done"><div style="width:100%"></div></span
                        ><span class="mono" style="font-size:11.5px">100%</span>
                      </span>
                      <span role="cell" class="status ok"
                        ><i class="ms" aria-hidden="true">check_circle</i>Completed</span
                      >
                    </div>
                  }
                  @if (!p.learning.active.length && !p.learning.completed.length) {
                    <div class="row" role="row"><span role="cell" class="faint">No courses yet.</span></div>
                  }
                </div>
              }
              @case ('projects') {
                <div class="empty dashed">
                  <span class="empty-title">No team projects yet</span
                  ><span class="empty-text"
                    >Finished projects show the role, duration, tasks, commits and reviews, all from the project’s own
                    records.</span
                  >
                </div>
              }
              @case ('certificates') {
                <div class="empty dashed">
                  <span class="empty-title">No certificates yet</span
                  ><span class="empty-text"
                    >Course and project certificates, each with a public verification link, appear here.</span
                  >
                </div>
              }
            }
          </div>

          <aside style="display:flex;flex-direction:column;gap:14px">
            <section class="panel sm">
              <span class="panel-title" style="font-size:14px">Study Buddies</span>
              <span class="faint" style="font-size:12px;margin-top:-6px"
                >One partner per course. A connection is something different.</span
              >
              <span class="faint sm">Study Buddy matching is coming soon.</span>
            </section>
            <section class="panel sm">
              <span class="panel-title" style="font-size:14px">Certificates</span>
              <span class="faint sm">None yet.</span>
            </section>
          </aside>
        </div>
      }
    </div>
  `,
})
export class ProfilePage {
  private readonly api = inject(Api);

  readonly username = input.required<string>();
  readonly profile = signal<Profile | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly tab = signal<Tab>('overview');
  readonly levelLabel = levelLabel;
  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'learning', label: 'Learning' },
    { id: 'projects', label: 'Projects' },
    { id: 'certificates', label: 'Certificates' },
  ];

  /** One line per skill; a DEMONSTRATED entry wins and shows the higher of the two levels. */
  readonly skills = computed<SkillLine[]>(() => {
    const byId = new Map<string, SkillLine>();
    const rank = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };
    for (const s of this.profile()?.skills ?? []) {
      const prev = byId.get(s.skillId);
      const proven = s.source === 'DEMONSTRATED' || !!prev?.proven;
      const level = prev && rank[prev.level] > rank[s.level] ? prev.level : s.level;
      byId.set(s.skillId, { skillId: s.skillId, name: s.name, level, proven });
    }
    return [...byId.values()].sort((a, b) => Number(b.proven) - Number(a.proven) || a.name.localeCompare(b.name));
  });
  readonly memberSince = computed(() => {
    const p = this.profile();
    return p ? new Date(p.memberSince).toLocaleDateString('en', { month: 'short', year: 'numeric' }) : '';
  });
  readonly visibilityIcon = computed(
    () => ({ PUBLIC: 'public', CONNECTIONS: 'group', PRIVATE: 'lock' })[this.profile()!.visibility],
  );
  readonly visibilityLabel = computed(
    () => ({ PUBLIC: 'Public', CONNECTIONS: 'Connections', PRIVATE: 'Private' })[this.profile()!.visibility],
  );

  constructor() {
    effect(() => {
      this.username();
      untracked(() => void this.load());
    });
  }

  countFor(t: Tab): string {
    const p = this.profile();
    if (!p) return '';
    if (t === 'learning') return String(p.learning.active.length + p.learning.completed.length);
    if (t === 'projects' || t === 'certificates') return '0';
    return '';
  }

  monthYear(iso: string) {
    return new Date(iso).toLocaleDateString('en', { month: 'short', year: 'numeric' });
  }

  async load() {
    this.error.set(null);
    this.profile.set(null);
    this.tab.set('overview');
    try {
      this.profile.set(await this.api.profile(this.username()));
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  protected readonly longDate = longDate;
}
