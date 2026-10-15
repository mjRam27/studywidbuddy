import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SkillLevel, type ApplicationView, type ProjectSummary } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { APPLICATION_STATUS, applicationSteps, levelLabel } from '../../core/format';
import { asyncState } from '../../core/resource';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { ProjectCardComponent } from './project-card.component';

const ROLES = [
  { key: '', label: 'All roles' },
  { key: 'frontend', label: 'Frontend' },
  { key: 'backend', label: 'Backend' },
  { key: 'devops', label: 'DevOps' },
  { key: 'qa', label: 'QA' },
  { key: 'ai-engineer', label: 'AI Engineer' },
];
const DIFFICULTIES: (SkillLevel | '')[] = ['', SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED];

const PROCESS = [
  { t: 'Apply', d: '~5 min' },
  { t: 'AI interview', d: '~25 min' },
  { t: 'Evaluation', d: '1–2 days' },
  { t: 'Team selection', d: 'at close' },
  { t: 'Build', d: '4–8 weeks' },
  { t: 'Final evaluation', d: 'certificate' },
];

/** Screen 47 · Project Discovery, on real projects and applications. */
@Component({
  selector: 'sb-project-discovery-page',
  imports: [RouterLink, FormsModule, TopbarComponent, ProjectCardComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Projects</span>
      <nav class="tabs" aria-label="Projects">
        <a class="tab on" routerLink="/projects" aria-current="page">Discover</a>
        <a class="tab" href="#my-applications"
          >My applications
          @if (liveApplications() > 0) {
            <span
              style="font-size:11px;font-weight:700;background:var(--brand);color:#fff;border-radius:8px;padding:1px 6px"
              >{{ liveApplications() }}</span
            >
          }
        </a>
      </nav>
      <form class="search-box" style="margin-left:auto" role="search" (ngSubmit)="search()">
        <i class="ms" aria-hidden="true">search</i>
        <input aria-label="Search projects" placeholder="Search projects, tech, roles" name="q" [(ngModel)]="draft" />
      </form>
    </sb-topbar>

    <div class="page">
      <div class="projects-layout">
        <div style="display:flex;flex-direction:column;gap:18px;min-width:0">
          <div class="page-head-text">
            <span class="build-eyebrow"
              ><span class="sq" aria-hidden="true"></span>SIMULATED PROFESSIONAL EXPERIENCE</span
            >
            <h1 class="big">Build real projects</h1>
            <span class="subline" style="font-size:15px"
              >Turn what you’ve learned into experience. Teams of 4–8, 4–8 weeks, with real repos and reviews.</span
            >
          </div>

          @if (recommended(); as r) {
            <div class="ready-banner">
              <div style="display:flex;flex-direction:column;gap:8px">
                <span class="k">YOU’RE READY TO BUILD</span>
                <span style="font-size:13px;color:#A3AABB">Based on</span>
                <div class="chips">
                  @for (s of r.matchedNames; track s) {
                    <span class="tag">{{ s }}</span>
                  }
                </div>
              </div>
              <div class="rec">
                <span style="font-size:12px;color:#A3AABB">Recommended</span>
                <span class="t">{{ r.project.title }}</span>
                <span class="s"
                  >{{ levelLabel(r.project.difficulty) }} · {{ r.project.skillMatch!.matched }} of
                  {{ r.project.skillMatch!.total }} skills match · {{ r.open }} seats open</span
                >
              </div>
              <a class="btn" [routerLink]="['/projects', r.project.slug]">View Project</a>
            </div>
          }

          <div class="filter-rows">
            <div class="filter-row" role="group" aria-label="Role">
              <span class="label">Role</span>
              @for (r of roles; track r.key) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="role() === r.key"
                  [attr.aria-pressed]="role() === r.key"
                  (click)="setRole(r.key)"
                >
                  {{ r.label }}
                </button>
              }
            </div>
            <div class="filter-row" role="group" aria-label="Difficulty">
              <span class="label">Difficulty</span>
              @for (d of difficulties; track d) {
                <button
                  type="button"
                  class="pill"
                  [class.on]="difficulty() === d"
                  [attr.aria-pressed]="difficulty() === d"
                  (click)="setDifficulty(d)"
                >
                  {{ d ? levelLabel(d) : 'All' }}
                </button>
              }
            </div>
          </div>

          @if (error()) {
            <sb-error-state [error]="error()" (retry)="load()" />
          } @else if (loading() && !projects().length) {
            <div class="project-grid">
              @for (i of [1, 2, 3, 4]; track i) {
                <div class="project-card"><sb-skeleton [rows]="6" /></div>
              }
            </div>
          } @else {
            <div class="project-grid" [attr.aria-busy]="loading()">
              @for (p of projects(); track p.id) {
                <sb-project-card [project]="p" />
              } @empty {
                <div class="empty" style="grid-column:1/-1">
                  <span class="empty-text">No projects match. Try another role or difficulty.</span>
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
                (click)="loadMore()"
              >
                @if (loading()) {
                  <span class="spinner" aria-hidden="true"></span>
                }
                Show more projects
              </button>
            }
          }
        </div>

        <aside style="display:flex;flex-direction:column;gap:14px">
          <section class="panel sm" id="my-applications" aria-labelledby="apps-h">
            <span class="panel-title" style="font-size:14px" id="apps-h">Your applications</span>
            @if (apps.error()) {
              <span class="faint sm"
                >Couldn’t load. <button type="button" class="link-strong" (click)="apps.reload()">Retry</button></span
              >
            } @else if (apps.value()) {
              @let list = apps.value()!;
              @for (a of list; track a.id) {
                <a class="app-item" [routerLink]="['/applications', a.id]">
                  <span class="t">{{ a.project.title }}</span>
                  <span class="faint" style="font-size:12px">{{ a.role.title }}</span>
                  <div class="app-steps" aria-hidden="true">
                    @for (i of [1, 2, 3, 4, 5]; track i) {
                      <span [class.on]="i <= steps(a)"></span>
                    }
                  </div>
                  <span class="status" [class]="'status ' + statusOf(a).tone" style="font-size:12px">
                    <i class="ms" aria-hidden="true">{{ statusOf(a).icon }}</i
                    >{{ statusOf(a).label }}
                    <span style="margin-left:auto;color:var(--brand)">Open</span>
                  </span>
                </a>
              } @empty {
                <span class="faint sm"
                  >No applications yet. Find a project with a role that fits and apply in about five minutes.</span
                >
              }
            } @else {
              <sb-skeleton [rows]="3" />
            }
          </section>
          <section class="panel sm" aria-labelledby="how-h" style="gap:10px">
            <span class="panel-title" style="font-size:14px" id="how-h">How selection works</span>
            @for (s of process; track s.t; let i = $index) {
              <div class="process-row">
                <span class="n">{{ i + 1 }}</span
                ><span class="t">{{ s.t }}</span
                ><span class="d">{{ s.d }}</span>
              </div>
            }
            <span class="faint" style="font-size:11.5px;line-height:1.5"
              >Teams are picked for skill coverage, not just top scores. You get written feedback whether or not you’re
              selected.</span
            >
          </section>
        </aside>
      </div>
    </div>
  `,
})
export class ProjectDiscoveryPage {
  private readonly api = inject(Api);

  readonly roles = ROLES;
  readonly difficulties = DIFFICULTIES;
  readonly process = PROCESS;
  readonly levelLabel = levelLabel;

  readonly role = signal('');
  readonly difficulty = signal<SkillLevel | ''>('');
  readonly q = signal('');
  draft = '';

  readonly projects = signal<ProjectSummary[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly error = signal<ApiError | null>(null);

  readonly apps = asyncState<ApplicationView[]>(() => this.api.myApplications());
  readonly liveApplications = computed(
    () => (this.apps.value() ?? []).filter((a) => !['WITHDRAWN', 'REJECTED', 'SELECTED'].includes(a.status)).length,
  );

  /** Best open project by share of tech-stack skills the user already has. Computed, not curated. */
  readonly recommended = computed(() => {
    const best = this.projects()
      .filter((p) => p.status === 'OPEN' && p.skillMatch && p.skillMatch.matched > 0)
      .sort((a, b) => b.skillMatch!.matched / b.skillMatch!.total - a.skillMatch!.matched / a.skillMatch!.total)[0];
    if (!best) return null;
    const ids = new Set(best.skillMatch!.matchedSkillIds);
    return {
      project: best,
      matchedNames: best.techStack.filter((s) => ids.has(s.id)).map((s) => s.name),
      open: best.roles.reduce((n, r) => n + r.open, 0),
    };
  });

  readonly steps = (a: ApplicationView) => applicationSteps(a.status);
  readonly statusOf = (a: ApplicationView) => APPLICATION_STATUS[a.status];

  constructor() {
    void this.load();
  }

  setRole(key: string) {
    this.role.set(key);
    void this.load();
  }

  setDifficulty(d: SkillLevel | '') {
    this.difficulty.set(d);
    void this.load();
  }

  search() {
    this.q.set(this.draft.trim());
    void this.load();
  }

  clear() {
    this.role.set('');
    this.difficulty.set('');
    this.q.set('');
    this.draft = '';
    void this.load();
  }

  async load(append = false) {
    this.loading.set(true);
    this.error.set(null);
    try {
      const page = await this.api.projects({
        role: this.role() || undefined,
        difficulty: this.difficulty() || undefined,
        q: this.q() || undefined,
        cursor: append ? (this.nextCursor() ?? undefined) : undefined,
        limit: 10,
      });
      this.projects.set(append ? [...this.projects(), ...page.items] : page.items);
      this.nextCursor.set(page.nextCursor);
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.loading.set(false);
    }
  }

  loadMore() {
    void this.load(true);
  }
}
