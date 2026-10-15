import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  STORY_POINTS,
  type TaskDetail,
  type TaskPriority,
  type TaskStatus,
  type UpdateTaskRequest,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { relativeTime } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { SkeletonComponent } from '../../ui/states.component';
import { PRIORITY_META, STATUS_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

@Component({
  selector: 'sb-task-drawer',
  imports: [FormsModule, AvatarComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside
      class="tdrawer"
      role="dialog"
      aria-modal="false"
      [attr.aria-label]="t()?.key ?? 'Task'"
      (keydown.escape)="closed.emit()"
    >
      <div class="tdrawer-head">
        @if (t(); as task) {
          <span class="mono faint" style="font-size:12px">{{ task.key }}</span>
          @if (task.status !== 'DONE' && task.blockedBy.length) {
            <span class="tstatus blocked"><i class="ms" aria-hidden="true">block</i>Blocked</span>
          } @else {
            <span class="tstatus" [class]="'tstatus ' + task.status"
              ><i class="ms" aria-hidden="true">{{ statusMeta[task.status].icon }}</i
              >{{ statusMeta[task.status].label }}</span
            >
          }
          @if (task.aiSuggested) {
            <span class="ai-label" style="font-size:9.5px"
              ><span class="ai-diamond" style="width:5px;height:5px" aria-hidden="true"></span>AI SUGGESTED</span
            >
          }
        }
        <button type="button" class="icon-btn" style="margin-left:auto" aria-label="Close task" (click)="closed.emit()">
          <i class="ms" aria-hidden="true">close</i>
        </button>
      </div>

      @if (!t()) {
        <div class="tdrawer-body"><sb-skeleton [rows]="8" /></div>
      } @else {
        @let task = t()!;
        <div class="tdrawer-body">
          @if (editingTitle()) {
            <input
              class="input"
              [ngModel]="task.title"
              #title
              (keydown.enter)="save({ title: title.value }); editingTitle.set(false)"
              (blur)="save({ title: title.value }); editingTitle.set(false)"
              aria-label="Title"
            />
          } @else {
            <button
              type="button"
              class="tdesc"
              style="font-size:19px;font-weight:600;line-height:1.3;color:var(--ink);background:none;border:0;padding:0;text-align:left;cursor:text"
              (click)="editingTitle.set(true)"
            >
              {{ task.title }}
            </button>
          }

          <div class="tsection">
            <span class="h">Move to</span>
            <div style="display:flex;gap:6px;flex-wrap:wrap">
              @for (s of task.allowedMoves; track s) {
                <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="move(s)">
                  <i class="ms" aria-hidden="true" [style.color]="statusMeta[s].color">{{ statusMeta[s].icon }}</i
                  >{{ statusMeta[s].label }}
                </button>
              }
              @if (task.status === 'REVIEW' && task.blockedBy.length) {
                <span class="faint sm"
                  >Done is locked until {{ blockedKeys() }} {{ task.blockedBy.length === 1 ? 'is' : 'are' }} done.</span
                >
              }
            </div>
          </div>

          <div class="tfacts">
            <span><label for="t-assignee">Assignee</label></span>
            <select
              id="t-assignee"
              [ngModel]="task.assignee?.id ?? null"
              (ngModelChange)="save({ assigneeId: $event })"
            >
              <option [ngValue]="null">Unassigned</option>
              @for (m of store.members(); track m.user.id) {
                <option [ngValue]="m.user.id">{{ m.user.displayName }} · {{ m.role.title }}</option>
              }
            </select>
            <span><label for="t-role">Role</label></span>
            <select id="t-role" [ngModel]="task.role?.id ?? null" (ngModelChange)="save({ roleId: $event })">
              <option [ngValue]="null">Shared</option>
              @for (r of store.roles(); track r.id) {
                <option [ngValue]="r.id">{{ r.title }}</option>
              }
            </select>
            <span><label for="t-prio">Priority</label></span>
            <select id="t-prio" [ngModel]="task.priority" (ngModelChange)="save({ priority: $event })">
              @for (p of priorities; track p) {
                <option [ngValue]="p">{{ prioMeta[p].label }}</option>
              }
            </select>
            <span><label for="t-est">Estimate</label></span>
            <select id="t-est" [ngModel]="task.estimate" (ngModelChange)="save({ estimate: $event })">
              @for (p of points; track p) {
                <option [ngValue]="p">{{ p }} points</option>
              }
            </select>
            <span><label for="t-sprint">Sprint</label></span>
            <select id="t-sprint" [ngModel]="task.sprintId" (ngModelChange)="save({ sprintId: $event })">
              <option [ngValue]="null">No sprint</option>
              @for (s of store.overview()?.sprints ?? []; track s.id) {
                <option [ngValue]="s.id">Sprint {{ s.number }}</option>
              }
            </select>
            <span>Depends on</span>
            <span>
              @for (d of task.dependsOn; track d.id) {
                <span
                  class="chip"
                  style="margin:0 4px 4px 0"
                  [style.color]="d.status === 'DONE' ? 'var(--success)' : '#F87171'"
                >
                  {{ d.key }} · {{ statusMeta[d.status].label }}
                  <button
                    type="button"
                    class="link-strong"
                    style="font-size:11px"
                    [attr.aria-label]="'Remove dependency ' + d.key"
                    (click)="removeDep(d.id)"
                  >
                    ×
                  </button>
                </span>
              } @empty {
                <span class="faint">None</span>
              }
              <select
                class="fselect"
                style="margin-top:4px"
                aria-label="Add dependency"
                [ngModel]="null"
                (ngModelChange)="addDep($event)"
              >
                <option [ngValue]="null">+ Add dependency</option>
                @for (o of depOptions(); track o.id) {
                  <option [ngValue]="o.id">{{ o.key }} {{ o.title }}</option>
                }
              </select>
            </span>
            <span><label for="t-branch">Branch</label></span>
            <input
              id="t-branch"
              class="mono"
              style="font-size:12px"
              [ngModel]="task.branch"
              placeholder="feature/task-{{ task.number }}"
              (change)="save({ branch: $any($event.target).value || null })"
            />
          </div>

          <div class="tsection">
            <span class="h">Description</span>
            <textarea
              class="textarea"
              rows="4"
              [ngModel]="task.description"
              (change)="save({ description: $any($event.target).value })"
              placeholder="What needs doing, and why?"
              aria-label="Description"
            ></textarea>
          </div>

          <div class="tsection">
            <span class="h">Acceptance criteria</span>
            @for (a of task.acceptanceCriteria; track $index) {
              <div class="tac">
                <i class="ms" aria-hidden="true">{{
                  task.status === 'DONE' ? 'check_box' : 'check_box_outline_blank'
                }}</i
                >{{ a }}
              </div>
            } @empty {
              <span class="faint sm">None yet.</span>
            }
            <input
              class="input"
              style="height:32px;font-size:13px"
              placeholder="Add a criterion and press Enter"
              #ac
              (keydown.enter)="addCriterion(ac.value); ac.value = ''"
              aria-label="New acceptance criterion"
            />
          </div>

          @if (task.blocks.length) {
            <div class="tsection">
              <span class="h">Blocks</span>
              @for (b of task.blocks; track b.id) {
                <span class="sm"
                  ><span class="mono faint">{{ b.key }}</span> {{ b.title }}</span
                >
              }
            </div>
          }

          <div class="tsection">
            <span class="h">Activity</span>
            @for (c of timeline(); track c.id) {
              <div class="tact">
                @if (c.kind === 'comment') {
                  <sb-avatar [name]="c.who" [colorKey]="c.whoId" [size]="22" />
                } @else {
                  <span style="width:22px;display:flex;justify-content:center"
                    ><i class="ms" aria-hidden="true" style="font-size:15px;color:var(--ink-3)">history</i></span
                  >
                }
                <div style="display:flex;flex-direction:column;gap:2px;flex:1">
                  <span class="faint"
                    ><b style="color:var(--ink)">{{ c.who }}</b> · {{ c.when }}</span
                  >
                  <span style="color:#d3d7e2;white-space:pre-wrap">{{ c.text }}</span>
                </div>
              </div>
            }
          </div>
        </div>
        <form class="tdrawer-foot" (ngSubmit)="comment()">
          <input
            name="c"
            [(ngModel)]="draft"
            placeholder="Comment on {{ task.key }}…"
            aria-label="Comment"
            maxlength="4000"
          />
          <button type="submit" class="btn btn-primary xs" [disabled]="!draft.trim() || busy()">Send</button>
        </form>
      }
    </aside>
  `,
  styles: [':host{display:contents}'],
})
export class TaskDrawerComponent {
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly taskId = input.required<string>();
  readonly closed = output<void>();
  readonly t = signal<TaskDetail | null>(null);
  readonly busy = signal(false);
  readonly editingTitle = signal(false);
  draft = '';

  readonly statusMeta = STATUS_META;
  readonly prioMeta = PRIORITY_META;
  readonly priorities: TaskPriority[] = ['HIGH', 'MEDIUM', 'LOW'];
  readonly points = STORY_POINTS;

  readonly depOptions = computed(() => {
    const t = this.t();
    if (!t) return [];
    const taken = new Set([t.id, ...t.dependsOn.map((d) => d.id)]);
    return this.store.tasks().filter((x) => !taken.has(x.id));
  });

  readonly timeline = computed(() => {
    const t = this.t();
    if (!t) return [];
    const comments = t.comments.map((c) => ({
      id: c.id,
      kind: 'comment' as const,
      who: c.author.displayName,
      whoId: c.author.id,
      when: relativeTime(c.createdAt),
      at: c.createdAt,
      text: c.body,
    }));
    const events = t.activity
      .filter((a) => a.type !== 'TASK_COMMENTED')
      .map((a) => ({
        id: a.id,
        kind: 'event' as const,
        who: a.actorKind === 'AGENT' ? 'AI PM' : (a.actor?.displayName ?? 'System'),
        whoId: a.actor?.id ?? 'x',
        when: relativeTime(a.createdAt),
        at: a.createdAt,
        text: a.summary,
      }));
    return [...comments, ...events].sort((a, b) => b.at.localeCompare(a.at));
  });

  constructor() {
    effect(() => {
      const id = this.taskId();
      untracked(() => void this.load(id));
    });
  }

  blockedKeys() {
    return (this.t()?.blockedBy ?? []).map((b) => b.key).join(', ');
  }

  private async load(id: string) {
    this.t.set(null);
    try {
      this.t.set(await this.api.task(id));
    } catch (e) {
      this.toast.error(toApiError(e).message);
      this.closed.emit();
    }
  }

  private async run(op: () => Promise<TaskDetail>) {
    this.busy.set(true);
    try {
      const updated = await op();
      this.t.set(updated);
      await this.store.refresh();
    } catch (e) {
      this.toast.error(toApiError(e).message);
      void this.load(this.taskId());
    } finally {
      this.busy.set(false);
    }
  }

  save(patch: UpdateTaskRequest) {
    const t = this.t();
    if (!t) return;
    if (patch.title !== undefined && (patch.title.trim() === t.title || patch.title.trim().length < 3)) return;
    void this.run(() => this.api.updateTask(t.id, patch));
  }

  move(status: TaskStatus) {
    void this.run(() => this.api.moveTask(this.taskId(), status));
  }

  addDep(id: string | null) {
    const t = this.t();
    if (!t || !id) return;
    void this.run(() => this.api.setDependencies(t.id, [...t.dependsOn.map((d) => d.id), id]));
  }

  removeDep(id: string) {
    const t = this.t();
    if (!t) return;
    void this.run(() =>
      this.api.setDependencies(
        t.id,
        t.dependsOn.map((d) => d.id).filter((x) => x !== id),
      ),
    );
  }

  addCriterion(text: string) {
    const t = this.t();
    if (!t || text.trim().length < 1) return;
    this.save({ acceptanceCriteria: [...t.acceptanceCriteria, text.trim()] });
  }

  comment() {
    const body = this.draft.trim();
    if (!body) return;
    this.draft = '';
    void this.run(() => this.api.commentTask(this.taskId(), body));
  }
}
