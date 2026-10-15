import { CdkDrag, type CdkDragDrop, CdkDropList, CdkDropListGroup } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TASK_STATUSES, type TaskCard, type TaskPriority, type TaskStatus } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { AuthService } from '../../core/auth.service';
import { toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';
import { TaskCardComponent } from './task-card.component';
import { STATUS_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

/**
 * Kanban board. Moves are optimistic in the UI but persisted through the API; when the
 * server rejects a move (state machine, blocked dependency) the card snaps back and the
 * reason is shown.
 */
@Component({
  selector: 'sb-board',
  imports: [CdkDropListGroup, CdkDropList, CdkDrag, FormsModule, TaskCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="board-filters" role="toolbar" aria-label="Board filters">
      <button type="button" class="fchip" [class.on]="!role()" (click)="role.set(null)">All</button>
      @for (r of store.roles(); track r.id) {
        <button type="button" class="fchip" [class.on]="role() === r.id" (click)="role.set(r.id)">
          {{ r.title.split(' ')[0] }}
        </button>
      }
      <span style="width:1px;height:18px;background:var(--line-strong);margin:0 6px" aria-hidden="true"></span>
      <button type="button" class="fchip" [class.on]="mine()" [attr.aria-pressed]="mine()" (click)="mine.set(!mine())">
        <i class="ms" aria-hidden="true">person</i>Assigned to me
      </button>
      <label class="sr-only" for="f-prio">Priority</label>
      <select id="f-prio" class="fselect" [ngModel]="priority()" (ngModelChange)="priority.set($event)">
        <option [ngValue]="null">Any priority</option>
        <option ngValue="HIGH">High</option>
        <option ngValue="MEDIUM">Medium</option>
        <option ngValue="LOW">Low</option>
      </select>
      <label class="sr-only" for="f-sprint">Sprint</label>
      <select id="f-sprint" class="fselect" [ngModel]="sprint()" (ngModelChange)="sprint.set($event)">
        <option [ngValue]="null">All sprints</option>
        @for (s of store.overview()?.sprints ?? []; track s.id) {
          <option [ngValue]="s.id">Sprint {{ s.number }}{{ s.status === 'ACTIVE' ? ' (active)' : '' }}</option>
        }
      </select>
      <span class="faint" style="margin-left:auto;font-size:12px"
        >{{ visibleCount() }} tasks · drag cards between columns</span
      >
    </div>
    <div class="board" cdkDropListGroup>
      @for (col of columns(); track col.status) {
        <section class="col" [attr.aria-label]="meta[col.status].label">
          <div class="col-head">
            <i class="ms" aria-hidden="true" [style.color]="meta[col.status].color">{{ meta[col.status].icon }}</i>
            <span class="h">{{ meta[col.status].short }}</span
            ><span class="n">{{ col.cards.length }}</span>
          </div>
          <div
            class="col-list"
            cdkDropList
            [cdkDropListData]="col.status"
            [id]="'col-' + col.status"
            (cdkDropListDropped)="drop($event)"
          >
            @for (t of col.cards; track t.id) {
              <sb-task-card
                cdkDrag
                [cdkDragData]="t"
                [task]="t"
                [selected]="t.id === selectedId()"
                (open)="open.emit($event)"
              />
            }
          </div>
        </section>
      }
    </div>
  `,
  styles: [':host{flex:1;display:flex;flex-direction:column;min-width:0;min-height:0}'],
})
export class BoardComponent {
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);

  readonly selectedId = input<string | null>(null);
  readonly open = output<string>();
  readonly meta = STATUS_META;

  readonly role = signal<string | null>(null);
  readonly mine = signal(false);
  readonly priority = signal<TaskPriority | null>(null);
  readonly sprint = signal<string | null>(null);

  private readonly visible = computed(() => {
    const me = this.auth.user()?.id;
    return this.store
      .tasks()
      .filter(
        (t) =>
          (!this.role() || t.role?.id === this.role()) &&
          (!this.mine() || t.assignee?.id === me) &&
          (!this.priority() || t.priority === this.priority()) &&
          (!this.sprint() || t.sprintId === this.sprint()),
      );
  });
  readonly visibleCount = computed(() => this.visible().length);
  readonly columns = computed(() =>
    TASK_STATUSES.map((status) => ({
      status,
      cards: this.visible()
        .filter((t) => t.status === status)
        .sort((a, b) => a.position - b.position || a.number - b.number),
    })),
  );

  async drop(e: CdkDragDrop<TaskStatus, TaskStatus, TaskCard>) {
    const card = e.item.data;
    const to = e.container.data;
    const target = this.columns()
      .find((c) => c.status === to)!
      .cards.filter((c) => c.id !== card.id);
    if (to === card.status && e.previousIndex === e.currentIndex) return;
    const before = target[e.currentIndex] ?? null;

    // Optimistic: show the card in its new place right away.
    const previous = this.store.tasks();
    const optimisticPos = before ? before.position - 0.5 : (target.at(-1)?.position ?? 0) + 1;
    this.store.replaceTask({ ...card, status: to, position: optimisticPos });
    try {
      await this.api.moveTask(card.id, to, before?.id ?? null);
      await this.store.refresh();
    } catch (err) {
      this.store.tasks.set(previous);
      this.toast.error(toApiError(err).message);
    }
  }
}
