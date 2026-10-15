import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { shortDate } from '../../core/format';
import { AvatarComponent } from '../../ui/avatar.component';
import { STATUS_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

/**
 * Overview tab. Everything here is derived from stored tasks and sprints. The "daily
 * summary" is computed from board data (not an LLM) until the AI PM agent lands.
 */
@Component({
  selector: 'sb-ws-overview',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (store.overview(); as o) {
      <div class="ws-scroll">
        <div class="ws-grid">
          <section class="ws-summary wide" aria-labelledby="sum-h">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="ai-label" id="sum-h"><span class="ai-diamond" aria-hidden="true"></span>BOARD SUMMARY</span>
              <span class="faint" style="font-size:11.5px">computed from the board just now</span>
            </div>
            <div class="ws-summary-grid">
              <div>
                <i class="ms" aria-hidden="true" style="color:#F87171">block</i>
                <span>
                  @if (o.blocked.length) {
                    <b>{{ o.blocked.length }} task{{ o.blocked.length === 1 ? ' is' : 's are' }} blocked.</b>
                    {{ blockedSentence() }}
                  } @else {
                    <b>Nothing is blocked.</b> Every open task’s dependencies are done.
                  }
                </span>
              </div>
              <div>
                <i class="ms" aria-hidden="true" style="color:#FBBF24">hourglass_top</i>
                <span>
                  @if (o.overdue.length) {
                    <b>{{ o.overdue.length }} overdue.</b> {{ overdueSentence() }}
                  } @else {
                    <b>Nothing overdue.</b> All due dates are in the future or met.
                  }
                </span>
              </div>
              <div>
                <i class="ms" aria-hidden="true" style="color:#8186FF">rate_review</i>
                <span
                  ><b>{{ o.counts.REVIEW }} in review,</b> {{ o.counts.IN_PROGRESS }} in progress,
                  {{ o.counts.TODO }} to do, {{ o.counts.DONE }} done.</span
                >
              </div>
            </div>
          </section>

          <section class="ws-card" aria-labelledby="burn-h">
            <div style="display:flex;align-items:center">
              <span class="ws-card-title" id="burn-h">{{
                o.activeSprint ? 'Sprint ' + o.activeSprint.number + ' progress' : 'Sprint progress'
              }}</span>
              @if (o.activeSprint; as s) {
                <span class="faint" style="margin-left:auto;font-size:12px"
                  >{{ s.points.done }} of {{ s.points.total }} pts · ends {{ shortDate(s.endsAt) }}</span
                >
              }
            </div>
            @if (o.burndown.length) {
              <div class="burn" role="img" [attr.aria-label]="'Remaining points per day: ' + burnLabel()">
                @for (b of o.burndown; track b.date) {
                  <div>
                    <div
                      class="bar"
                      [class.future]="b.remaining === null"
                      [style.height.%]="barHeight(b.remaining)"
                    ></div>
                    <span class="d">{{ weekday(b.date) }}</span>
                  </div>
                }
              </div>
              <div style="display:flex;gap:16px;font-size:11.5px;color:var(--ink-2);flex-wrap:wrap">
                <span style="display:flex;align-items:center;gap:5px"
                  ><span style="width:9px;height:9px;border-radius:2px;background:var(--ai)"></span>Points
                  remaining</span
                >
                <span style="display:flex;align-items:center;gap:5px"
                  ><span style="width:9px;height:9px;border-radius:2px;border:1px dashed var(--ink-4)"></span>Days
                  ahead</span
                >
              </div>
            } @else {
              <span class="faint sm"
                >No active sprint. Plan one on the Plan tab, or ask the AI PM to propose a plan.</span
              >
            }
            @for (r of o.healthReasons; track r) {
              <span class="sm" style="color:var(--ink-2)">{{ r }}</span>
            }
          </section>

          <section class="ws-card" aria-labelledby="ms-h">
            <span class="ws-card-title" id="ms-h">Milestones</span>
            @for (m of o.milestones; track m.id) {
              <div style="display:flex;align-items:center;gap:10px;font-size:13px">
                <span
                  style="width:14px;height:14px;border-radius:50%;border:2px solid;flex-shrink:0"
                  [style.border-color]="m.completedAt ? '#4ADE80' : 'var(--line-strong)'"
                  [style.background]="m.completedAt ? '#4ADE80' : 'transparent'"
                  aria-hidden="true"
                ></span>
                <span class="grow"
                  >{{ m.title }}<span class="sr-only">{{ m.completedAt ? ' (done)' : '' }}</span></span
                >
                @if (m.dueDate) {
                  <span class="mono faint" style="font-size:11px">{{ shortDate(m.dueDate).toUpperCase() }}</span>
                }
              </div>
            } @empty {
              <span class="faint sm">No milestones yet.</span>
            }
          </section>

          <section class="ws-card" aria-labelledby="bl-h">
            <span class="ws-card-title" id="bl-h">Blockers &amp; deadlines</span>
            @for (t of attention(); track t.id) {
              <button
                type="button"
                class="ws-row"
                style="background:none;border-left:0;border-right:0;border-bottom:0;text-align:left;width:100%"
                (click)="openTask.emit(t.id)"
              >
                <i class="ms" aria-hidden="true" style="font-size:16px;color:#F87171">{{
                  t.blockedBy.length ? 'block' : 'schedule'
                }}</i>
                <span class="key">{{ t.key }}</span>
                <span class="grow ellipsis">{{ t.title }}{{ t.assignee ? ' · ' + t.assignee.displayName : '' }}</span>
                <span style="font-size:11.5px;color:#F87171">{{
                  t.blockedBy.length ? 'blocked by ' + t.blockedBy[0].key : 'overdue'
                }}</span>
              </button>
            } @empty {
              <span class="faint sm">Nothing needs attention.</span>
            }
          </section>

          <section class="ws-card" aria-labelledby="st-h">
            <span class="ws-card-title" id="st-h">Sprints</span>
            @for (s of o.sprints; track s.id) {
              <div class="ws-row">
                <span class="key">S{{ s.number }}</span>
                <span class="grow ellipsis">{{ s.goal }}</span>
                <span class="faint" style="font-size:11.5px">{{ s.points.done }}/{{ s.points.total }} pts</span>
                <span
                  class="status"
                  [class.info]="s.status === 'ACTIVE'"
                  [class.ok]="s.status === 'COMPLETED'"
                  [class.neutral]="s.status === 'PLANNED'"
                  >{{ s.status.toLowerCase() }}</span
                >
              </div>
            } @empty {
              <span class="faint sm">No sprints yet.</span>
            }
          </section>

          <section class="ws-card wide" aria-labelledby="tm-h">
            <span class="ws-card-title" id="tm-h">Team</span>
            <div class="ws-team-grid">
              @for (m of o.members; track m.memberId) {
                <div class="ws-member">
                  <div style="display:flex;align-items:center;gap:8px">
                    <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [size]="28" />
                    <div style="display:flex;flex-direction:column;line-height:1.25;min-width:0">
                      <span class="ellipsis" style="font-size:12.5px;font-weight:600">{{ m.user.displayName }}</span>
                      <span style="font-size:11px;color:var(--ink-2)">{{ m.role.title }}</span>
                    </div>
                  </div>
                  @if (m.current; as c) {
                    <button
                      type="button"
                      style="font-size:11.5px;display:flex;align-items:center;gap:4px;background:none;border:0;padding:0;text-align:left"
                      [style.color]="statusMeta[c.status].color"
                      (click)="openTask.emit(c.id)"
                    >
                      <i class="ms" aria-hidden="true" style="font-size:13px">{{ statusMeta[c.status].icon }}</i
                      >{{ c.key }} · {{ statusMeta[c.status].label.toLowerCase() }}
                    </button>
                  } @else {
                    <span class="faint" style="font-size:11.5px">No task in progress</span>
                  }
                  <span class="faint" style="font-size:11px">{{ m.openPoints }} open pts</span>
                </div>
              }
            </div>
          </section>
        </div>
      </div>
    }
  `,
  styles: [':host{flex:1;display:flex;min-width:0}'],
})
export class OverviewComponent {
  readonly store = inject(WorkspaceStore);
  readonly openTask = output<string>();
  readonly statusMeta = STATUS_META;
  readonly shortDate = shortDate;

  private readonly maxRemaining = computed(() =>
    Math.max(1, ...(this.store.overview()?.burndown ?? []).map((b) => b.remaining ?? 0)),
  );
  readonly attention = computed(() => {
    const o = this.store.overview();
    if (!o) return [];
    const seen = new Set<string>();
    return [...o.blocked, ...o.overdue].filter((t) => !seen.has(t.id) && seen.add(t.id)).slice(0, 6);
  });

  barHeight(remaining: number | null) {
    if (remaining === null) {
      // Future days: a faint outline at the last known level.
      const known = (this.store.overview()?.burndown ?? []).filter((b) => b.remaining !== null);
      return (((known.at(-1)?.remaining ?? 0) / this.maxRemaining()) * 100) / 2 || 4;
    }
    return Math.max(2, (remaining / this.maxRemaining()) * 100);
  }

  weekday(date: string) {
    return new Date(date + 'T12:00:00Z').toLocaleDateString('en', { weekday: 'narrow' });
  }

  burnLabel() {
    return (this.store.overview()?.burndown ?? [])
      .filter((b) => b.remaining !== null)
      .map((b) => `${b.date} ${b.remaining}`)
      .join(', ');
  }

  blockedSentence() {
    const o = this.store.overview()!;
    const byBlocker = new Map<string, string[]>();
    for (const t of o.blocked)
      for (const b of t.blockedBy) byBlocker.set(b.key, [...(byBlocker.get(b.key) ?? []), t.key]);
    const [top] = [...byBlocker].sort((a, b) => b[1].length - a[1].length);
    return top ? `${top[1].join(' and ')} ${top[1].length === 1 ? 'is' : 'are'} waiting on ${top[0]}.` : '';
  }

  overdueSentence() {
    const o = this.store.overview()!;
    return o.overdue
      .slice(0, 2)
      .map((t) => `${t.key}${t.assignee ? ` (${t.assignee.displayName})` : ''}`)
      .join(', ');
  }
}
