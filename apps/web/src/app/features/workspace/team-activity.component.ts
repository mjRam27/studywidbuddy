import { ChangeDetectionStrategy, Component, inject, type OnInit, output, signal } from '@angular/core';
import type { ActivityItem } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { relativeTime } from '../../core/format';
import { AvatarComponent } from '../../ui/avatar.component';
import { STATUS_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

@Component({
  selector: 'sb-ws-team',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      <section class="ws-card" style="padding:0;overflow:hidden" aria-label="Team">
        <div class="ws-table-row head">
          <span>MEMBER</span><span>SKILLS</span><span>OPEN WORK</span><span>CURRENT</span>
        </div>
        @for (m of store.members(); track m.memberId) {
          <div class="ws-table-row">
            <span style="display:flex;align-items:center;gap:10px;min-width:0">
              <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [size]="30" />
              <span style="display:flex;flex-direction:column;line-height:1.3;min-width:0">
                <span class="ellipsis" style="font-weight:600">{{ m.user.displayName }}</span>
                <span style="font-size:11.5px;color:var(--ink-2)">{{ m.role.title }}</span>
              </span>
            </span>
            <span style="display:flex;flex-wrap:wrap;gap:4px">
              @for (k of m.skills; track k) {
                <span
                  style="font-size:11px;padding:1px 6px;border:1px solid var(--line-strong);border-radius:3px;color:#d3d7e2"
                  >{{ k }}</span
                >
              }
            </span>
            <span class="mono" style="font-size:12px">{{ m.openPoints }} pts</span>
            @if (m.current; as c) {
              <button
                type="button"
                style="font-size:12px;display:flex;align-items:center;gap:4px;background:none;border:0;padding:0;text-align:left"
                [style.color]="meta[c.status].color"
                (click)="openTask.emit(c.id)"
              >
                <i class="ms" aria-hidden="true" style="font-size:14px">{{ meta[c.status].icon }}</i
                >{{ c.key }} · {{ meta[c.status].label.toLowerCase() }}
              </button>
            } @else {
              <span class="faint" style="font-size:12px">—</span>
            }
          </div>
        }
      </section>
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0}'],
})
export class TeamTabComponent {
  readonly store = inject(WorkspaceStore);
  readonly openTask = output<string>();
  readonly meta = STATUS_META;
}

@Component({
  selector: 'sb-ws-activity',
  imports: [AvatarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      <section class="ws-card" aria-label="Project activity">
        @for (a of items(); track a.id) {
          <div class="tact" style="padding:6px 0">
            @if (a.actorKind === 'AGENT') {
              <span style="width:22px;display:flex;justify-content:center"
                ><span class="ai-diamond" aria-hidden="true"></span
              ></span>
            } @else if (a.actor) {
              <sb-avatar [name]="a.actor.displayName" [colorKey]="a.actor.id" [size]="22" />
            } @else {
              <span style="width:22px"></span>
            }
            <span class="grow" style="color:#d3d7e2">
              <b style="color:var(--ink)">{{
                a.actorKind === 'AGENT' ? 'AI PM' : (a.actor?.displayName ?? 'System')
              }}</b>
              {{ a.summary }}
              @if (a.task; as t) {
                <button
                  type="button"
                  class="link-strong"
                  style="font-size:12px;margin-left:4px"
                  (click)="openTask.emit(t.id)"
                >
                  Open {{ t.key }}
                </button>
              }
            </span>
            <span class="faint mono" style="font-size:11px;white-space:nowrap">{{ rel(a.createdAt) }}</span>
          </div>
        } @empty {
          <span class="faint sm">{{ loading() ? 'Loading…' : 'No activity yet.' }}</span>
        }
        @if (cursor()) {
          <button
            type="button"
            class="btn btn-secondary xs"
            style="align-self:center"
            [disabled]="loading()"
            (click)="load()"
          >
            Load older
          </button>
        }
      </section>
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0}'],
})
export class ActivityTabComponent implements OnInit {
  private readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  readonly openTask = output<string>();
  readonly items = signal<ActivityItem[]>([]);
  readonly cursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly rel = relativeTime;

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loading.set(true);
    try {
      const page = await this.api.projectActivity(this.store.slug(), this.cursor() ?? undefined);
      this.items.update((i) => [...i, ...page.items]);
      this.cursor.set(page.nextCursor);
    } catch (e) {
      this.items.set([]);
      console.error(toApiError(e).message);
    } finally {
      this.loading.set(false);
    }
  }
}
