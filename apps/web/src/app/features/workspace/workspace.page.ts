import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { STORY_POINTS, type TaskPriority } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';
import { shortDate } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { BoardComponent } from './board.component';
import { ChatComponent } from './chat.component';
import { GithubTabComponent } from './github.component';
import { MeetingsComponent } from './meetings.component';
import { PmComponent } from './pm.component';
import { OverviewComponent } from './overview.component';
import { PlanComponent } from './plan.component';
import { TaskDrawerComponent } from './task-drawer.component';
import { ActivityTabComponent, TeamTabComponent } from './team-activity.component';
import { HEALTH_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

type Tab = 'overview' | 'board' | 'plan' | 'team' | 'activity' | 'pm' | 'chat' | 'meetings' | 'github';
const TAB_IDS: Tab[] = ['overview', 'board', 'plan', 'team', 'activity', 'pm', 'chat', 'meetings', 'github'];
const TABS: { id: Tab | string; label: string; soon?: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'board', label: 'Board' },
  { id: 'plan', label: 'Plan' },
  { id: 'team', label: 'Team' },
  { id: 'activity', label: 'Activity' },
  { id: 'pm', label: 'AI PM' },
  { id: 'meetings', label: 'Meetings' },
  { id: 'chat', label: 'Chat' },
  { id: 'github', label: 'GitHub' },
  { id: 'code', label: 'Code', soon: 'M7' },
];

/** Screen 55 · Project Workspace (dark, edge-to-edge, with the 56px rail). */
@Component({
  selector: 'sb-workspace-page',
  imports: [
    RouterLink,
    FormsModule,
    AvatarComponent,
    ErrorStateComponent,
    SkeletonComponent,
    OverviewComponent,
    BoardComponent,
    PlanComponent,
    TeamTabComponent,
    ActivityTabComponent,
    TaskDrawerComponent,
    PmComponent,
    MeetingsComponent,
    ChatComponent,
    GithubTabComponent,
  ],
  providers: [WorkspaceStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'data-theme': 'dark', style: 'display:block' },
  template: `
    <div class="ws">
      <nav class="ws-rail" aria-label="Main">
        <a
          routerLink="/home"
          class="brand-mark"
          aria-label="StudywidBuddy home"
          style="display:block;position:relative;width:24px;height:16px;margin-bottom:14px;background:none"
          ><span></span><span></span
        ></a>
        @for (r of rail; track r.path) {
          <a [routerLink]="r.path" [title]="r.label" [class.on]="r.path === '/projects'" [attr.aria-label]="r.label"
            ><i class="ms" aria-hidden="true">{{ r.icon }}</i></a
          >
        }
        @if (auth.user(); as u) {
          <a class="me" [routerLink]="['/u', u.username]" [attr.aria-label]="'Your profile'"
            ><sb-avatar [name]="u.displayName" [self]="true" [size]="30"
          /></a>
        }
      </nav>

      <div class="ws-main">
        @if (store.error()) {
          <div class="ws-scroll">
            <sb-error-state
              [error]="store.error()"
              [title]="
                store.error()!.status === 403 ? 'This workspace is for the project team' : 'The workspace didn’t load'
              "
              (retry)="store.load(slug())"
            />
            <a class="btn btn-secondary" style="margin-top:12px" [routerLink]="['/projects', slug()]"
              >Back to project</a
            >
          </div>
        } @else if (!store.overview()) {
          <div class="ws-scroll"><sb-skeleton [rows]="8" [height]="22" /></div>
        } @else {
          @let o = store.overview()!;
          <header class="ws-header">
            <div class="ws-title-row">
              <span class="sq" aria-hidden="true"></span>
              <h1 class="ws-title">{{ o.project.title }}</h1>
              @if (o.activeSprint; as s) {
                <span class="ws-sprint-meta"
                  >Sprint {{ s.number }} of {{ o.sprints.length }} · ends {{ endDate(s.endsAt) }}</span
                >
                <span class="ws-bar"
                  ><span class="track"><div [style.width.%]="pct(s.points.done, s.points.total)"></div></span
                  ><span class="mono faint" style="font-size:11.5px"
                    >{{ pct(s.points.done, s.points.total) }}% complete</span
                  ></span
                >
              }
              <span class="health" [class]="'health ' + o.health.toLowerCase()" [title]="o.healthReasons.join(' ')">
                <i class="ms" aria-hidden="true">{{ health[o.health].icon }}</i
                >{{ health[o.health].label }}
              </span>
              <div class="ws-head-end">
                <div class="ws-faces" aria-label="Team">
                  @for (m of o.members; track m.memberId) {
                    <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [size]="28" [decorative]="false" />
                  }
                </div>
                <a class="btn btn-secondary xs" [routerLink]="['/projects', o.project.slug]"
                  ><i class="ms" aria-hidden="true">info</i>Brief</a
                >
                <button type="button" class="btn btn-primary xs" (click)="newTask.set(true)">
                  <i class="ms" aria-hidden="true">add</i>Task
                </button>
              </div>
            </div>
            <nav class="ws-tabs" role="tablist" aria-label="Workspace">
              @for (t of tabs; track t.id) {
                <button
                  type="button"
                  role="tab"
                  class="ws-tab"
                  [class.on]="activeTab() === t.id"
                  [attr.aria-selected]="activeTab() === t.id"
                  [disabled]="!!t.soon"
                  [title]="t.soon ? 'Arrives in milestone ' + t.soon.slice(1) : ''"
                  (click)="setTab(t.id)"
                >
                  {{ t.label }}
                  @if (t.id === 'board') {
                    <span class="count">{{ store.tasks().length }}</span>
                  }
                  @if (t.id === 'pm' && t.id !== activeTab()) {
                    <span class="ai-diamond" style="width:6px;height:6px" aria-hidden="true"></span>
                  }
                  @if (t.id === 'team') {
                    <span class="count">{{ o.members.length }}</span>
                  }
                  @if (t.soon) {
                    <span class="soon">SOON</span>
                  }
                </button>
              }
            </nav>
          </header>

          <div class="ws-body">
            @switch (activeTab()) {
              @case ('overview') {
                <sb-ws-overview (openTask)="openTask($event)" />
              }
              @case ('board') {
                <sb-board [selectedId]="task() ?? null" (open)="openTask($event)" />
              }
              @case ('plan') {
                <sb-ws-plan />
              }
              @case ('team') {
                <sb-ws-team (openTask)="openTask($event)" />
              }
              @case ('activity') {
                <sb-ws-activity (openTask)="openTask($event)" />
              }
              @case ('pm') {
                <sb-ws-pm />
              }
              @case ('meetings') {
                <sb-ws-meetings [meetingId]="meeting() ?? null" (open)="openMeeting($event)" />
              }
              @case ('github') {
                <sb-ws-github (openTask)="openTask($event)" />
              }
              @case ('chat') {
                <sb-ws-chat (openMeeting)="openMeeting($event)" />
              }
            }
            @if (task(); as id) {
              <sb-task-drawer [taskId]="id" (closed)="openTask(null)" />
            }
          </div>
        }
      </div>
    </div>

    @if (newTask()) {
      <div class="overlay" (keydown.escape)="newTask.set(false)">
        <form class="modal" role="dialog" aria-modal="true" aria-labelledby="nt-h" (ngSubmit)="createTask()">
          <div class="modal-head">
            <div class="modal-title">
              <span class="display" id="nt-h">New task</span><span>Added to the backlog unless you pick To do.</span>
            </div>
          </div>
          <div class="modal-body">
            <div class="field">
              <label for="nt-title">Title</label
              ><input
                id="nt-title"
                class="input"
                name="title"
                [(ngModel)]="draft.title"
                required
                minlength="3"
                maxlength="200"
              />
            </div>
            <div class="form-row">
              <div class="field">
                <label for="nt-assignee">Assignee</label>
                <select id="nt-assignee" class="select" name="assignee" [(ngModel)]="draft.assigneeId">
                  <option [ngValue]="null">Unassigned</option>
                  @for (m of store.members(); track m.user.id) {
                    <option [ngValue]="m.user.id">{{ m.user.displayName }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <label for="nt-role">Role</label>
                <select id="nt-role" class="select" name="role" [(ngModel)]="draft.roleId">
                  <option [ngValue]="null">Shared</option>
                  @for (r of store.roles(); track r.id) {
                    <option [ngValue]="r.id">{{ r.title }}</option>
                  }
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="nt-prio">Priority</label>
                <select id="nt-prio" class="select" name="prio" [(ngModel)]="draft.priority">
                  <option ngValue="HIGH">High</option>
                  <option ngValue="MEDIUM">Medium</option>
                  <option ngValue="LOW">Low</option>
                </select>
              </div>
              <div class="field">
                <label for="nt-est">Estimate</label>
                <select id="nt-est" class="select" name="est" [(ngModel)]="draft.estimate">
                  @for (p of points; track p) {
                    <option [ngValue]="p">{{ p }} pts</option>
                  }
                </select>
              </div>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="nt-sprint">Sprint</label>
                <select id="nt-sprint" class="select" name="sprint" [(ngModel)]="draft.sprintId">
                  <option [ngValue]="null">No sprint</option>
                  @for (s of store.overview()?.sprints ?? []; track s.id) {
                    @if (s.status !== 'COMPLETED') {
                      <option [ngValue]="s.id">Sprint {{ s.number }}</option>
                    }
                  }
                </select>
              </div>
              <div class="field">
                <label for="nt-col">Column</label>
                <select id="nt-col" class="select" name="col" [(ngModel)]="draft.status">
                  <option ngValue="BACKLOG">Backlog</option>
                  <option ngValue="TODO">To do</option>
                </select>
              </div>
            </div>
            <div class="field">
              <label for="nt-desc">Description <span class="opt">optional</span></label
              ><textarea id="nt-desc" class="textarea" rows="3" name="desc" [(ngModel)]="draft.description"></textarea>
            </div>
          </div>
          <div class="modal-foot">
            <button type="button" class="btn btn-secondary" (click)="newTask.set(false)">Cancel</button>
            <button type="submit" class="btn btn-primary" [disabled]="creating() || draft.title.trim().length < 3">
              Create task
            </button>
          </div>
        </form>
      </div>
    }
  `,
})
export class WorkspacePage {
  readonly store = inject(WorkspaceStore);
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  /** Query params (component input binding). */
  readonly tab = input<string | undefined>();
  readonly meeting = input<string | undefined>();
  readonly task = input<string | undefined>();

  readonly tabs = TABS;
  readonly health = HEALTH_META;
  readonly points = STORY_POINTS;
  readonly activeTab = computed<Tab>(() => (TAB_IDS.includes(this.tab() as Tab) ? (this.tab() as Tab) : 'overview'));
  readonly rail = [
    { path: '/home', icon: 'home', label: 'Home' },
    { path: '/learn', icon: 'school', label: 'Learn' },
    { path: '/projects', icon: 'deployed_code', label: 'Projects' },
    { path: '/people', icon: 'group', label: 'People' },
    { path: '/messages', icon: 'forum', label: 'Messages' },
    { path: '/jobs', icon: 'work', label: 'Jobs' },
  ];

  readonly newTask = signal(false);
  readonly creating = signal(false);
  draft = this.emptyDraft();

  constructor() {
    effect(() => {
      const s = this.slug();
      untracked(() => void this.store.load(s));
    });
  }

  pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  endDate = (iso: string) =>
    new Date(iso).toLocaleDateString('en', { weekday: 'short', day: 'numeric', month: 'short' });
  shortDate = shortDate;

  setTab(id: string) {
    void this.router.navigate([], {
      queryParams: { tab: id === 'overview' ? null : id, meeting: null },
      queryParamsHandling: 'merge',
    });
  }

  openMeeting(id: string | null) {
    void this.router.navigate([], { queryParams: { tab: 'meetings', meeting: id }, queryParamsHandling: 'merge' });
  }
  openTask(id: string | null) {
    void this.router.navigate([], { queryParams: { task: id }, queryParamsHandling: 'merge' });
  }

  private emptyDraft() {
    return {
      title: '',
      description: '',
      assigneeId: null as string | null,
      roleId: null as string | null,
      priority: 'MEDIUM' as TaskPriority,
      estimate: 3,
      sprintId: (this.store?.overview()?.activeSprint?.id ?? null) as string | null,
      status: 'BACKLOG' as 'BACKLOG' | 'TODO',
    };
  }

  async createTask() {
    this.creating.set(true);
    try {
      const t = await this.api.createTask(this.slug(), {
        ...this.draft,
        title: this.draft.title.trim(),
        description: this.draft.description.trim() || undefined,
      });
      this.newTask.set(false);
      this.draft = this.emptyDraft();
      await this.store.refresh();
      this.toast.ok(`${t.key} created.`);
      this.openTask(t.id);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.creating.set(false);
    }
  }
}
