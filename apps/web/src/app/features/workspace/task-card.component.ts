import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { TaskCard } from '@studywidbuddy/shared';
import { AvatarComponent } from '../../ui/avatar.component';
import { PRIORITY_META } from './workspace-meta';

@Component({
  selector: 'sb-task-card',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = task();
    <button
      type="button"
      class="tcard"
      [class.blocked]="t.blockedBy.length && t.status !== 'DONE'"
      [class.ai]="t.aiSuggested && !t.blockedBy.length"
      [class.sel]="selected()"
      (click)="open.emit(t.id)"
      [attr.aria-label]="t.key + ' ' + t.title"
    >
      <span class="top">
        {{ t.key }}
        @if (t.aiSuggested && t.status === 'BACKLOG') {
          <span class="ai-tag"
            ><span class="ai-diamond" style="width:5px;height:5px" aria-hidden="true"></span>AI SUGGESTED</span
          >
        } @else {
          <span class="prio" [class]="'prio ' + t.priority"
            ><i class="ms" aria-hidden="true">{{ prio[t.priority].icon }}</i
            >{{ prio[t.priority].label }}</span
          >
        }
      </span>
      <span class="t">{{ t.title }}</span>
      @if (t.status !== 'DONE' && t.blockedBy.length) {
        <span class="dep" style="color:#F87171"
          ><i class="ms" aria-hidden="true">block</i>Blocked by {{ blockedKeys() }}</span
        >
      } @else if (t.overdue) {
        <span class="dep" style="color:#F87171"><i class="ms" aria-hidden="true">schedule</i>Overdue</span>
      } @else if (t.pullRequestUrl) {
        <span class="dep" style="color:#4ADE80"><i class="ms" aria-hidden="true">merge</i>Pull request linked</span>
      } @else if (t.dependsOnCount) {
        <span class="dep" style="color:var(--ink-2)"
          ><i class="ms" aria-hidden="true">link</i>{{ t.dependsOnCount }} dependenc{{
            t.dependsOnCount === 1 ? 'y' : 'ies'
          }}
          done</span
        >
      }
      <span class="foot">
        @if (t.role) {
          <span class="role">{{ t.role.title.split(' ')[0] }}</span>
        }
        <span class="mono">{{ t.estimate }} pts</span>
        @if (t.assignee; as a) {
          <sb-avatar [name]="a.displayName" [colorKey]="a.id" [size]="20" [decorative]="false" />
        }
      </span>
    </button>
  `,
  styles: [':host{display:block}'],
})
export class TaskCardComponent {
  readonly task = input.required<TaskCard>();
  readonly selected = input(false);
  readonly open = output<string>();
  readonly prio = PRIORITY_META;
  blockedKeys() {
    return this.task()
      .blockedBy.map((b) => b.key)
      .join(', ');
  }
}
