import { ChangeDetectionStrategy, Component, computed, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AGENT_GOAL_MAX,
  RT_EVENTS,
  type AgentRunView,
  type AgentToolCallView,
  type PmOverview,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { ToastService } from '../../core/toast.service';
import { SkeletonComponent } from '../../ui/states.component';
import { WorkspaceStore } from './workspace.store';

const MEMORY_LABEL: Record<string, string> = {
  FACT: 'Fact',
  DECISION: 'Decision',
  RISK: 'Risk',
  MEMBER_NOTE: 'Member note',
  SUMMARY: 'Meeting',
};

/**
 * AI PM tab. Everything the agent did is visible here: each run's steps and tool calls,
 * proposals waiting for approval, and its memory of this project (which members can correct).
 */
@Component({
  selector: 'sb-ws-pm',
  imports: [FormsModule, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      @if (!pm()) {
        <sb-skeleton [rows]="6" [height]="22" />
      } @else {
        @let o = pm()!;
        <div class="ws-grid">
          <section class="ws-card wide" aria-labelledby="pm-h">
            <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
              <span class="ai-label" id="pm-h"
                ><span class="ai-diamond" aria-hidden="true"></span>AI PROJECT MANAGER</span
              >
              <span class="faint" style="font-size:12px"
                >Reads the board, runs check-ins, remembers decisions. Changes to tasks always need your approval.</span
              >
            </div>
            @if (!o.aiConfigured) {
              <div class="banner warn" style="font-size:12.5px">
                <i class="ms" aria-hidden="true">cloud_off</i>The AI PM isn’t available on this server yet.
              </div>
            }
            <form class="pm-ask" (ngSubmit)="run()">
              <label class="sr-only" for="pm-goal">What should the AI PM look at?</label>
              <input
                id="pm-goal"
                class="input"
                name="goal"
                [(ngModel)]="goal"
                [maxlength]="goalMax"
                placeholder="Optional: “Rebalance work for the auth tasks”, “Is sprint 2 at risk?”"
              />
              <button type="submit" class="btn btn-primary" [disabled]="busy() || !o.aiConfigured || running()">
                <i class="ms" aria-hidden="true">auto_awesome</i>{{ running() ? 'Working…' : 'Ask the AI PM' }}
              </button>
            </form>
            @if (isAdmin()) {
              <div class="pm-settings">
                <label class="voice-toggle"
                  ><input type="checkbox" [ngModel]="o.enabled" (ngModelChange)="settings({ enabled: $event })" />AI PM
                  enabled for this project</label
                >
                <label class="voice-toggle"
                  >Check-in every
                  <select
                    class="fselect"
                    [ngModel]="o.meetingIntervalDays"
                    (ngModelChange)="settings({ meetingIntervalDays: +$event })"
                  >
                    @for (d of intervals; track d) {
                      <option [ngValue]="d">{{ d }}</option>
                    }
                  </select>
                  days</label
                >
              </div>
            }
          </section>

          <section class="ws-card wide" aria-labelledby="ap-h">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="ws-card-title" id="ap-h">Waiting for approval</span>
              @if (o.approvals.length) {
                <span class="status warn"
                  ><i class="ms" aria-hidden="true">hourglass_top</i>{{ o.approvals.length }}</span
                >
              }
            </div>
            @for (a of o.approvals; track a.id) {
              <div class="pm-approval">
                <div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">
                  <span style="font-size:13.5px;font-weight:600">{{ a.label }}</span>
                  <span class="faint" style="font-size:12px">{{
                    reason(a) ?? 'From: ' + a.runGoal.split('\\n')[0]
                  }}</span>
                </div>
                <button type="button" class="btn btn-primary xs" [disabled]="busy()" (click)="decide(a, true)">
                  Approve
                </button>
                <button type="button" class="btn btn-ghost xs" [disabled]="busy()" (click)="decide(a, false)">
                  Reject
                </button>
              </div>
            } @empty {
              <span class="faint sm"
                >Nothing to approve. When the AI PM proposes a task or a change, it waits here.</span
              >
            }
          </section>

          <section class="ws-card" aria-labelledby="runs-h">
            <span class="ws-card-title" id="runs-h">What the AI PM did</span>
            @for (r of o.runs; track r.id) {
              <button
                type="button"
                class="pm-run"
                [class.on]="openRun()?.id === r.id"
                [attr.aria-expanded]="openRun()?.id === r.id"
                (click)="toggleRun(r.id)"
              >
                <i
                  class="ms"
                  aria-hidden="true"
                  [class.ok-ic]="r.status === 'COMPLETED'"
                  [class.warn-ic]="r.status === 'FAILED'"
                  >{{
                    r.status === 'COMPLETED' ? 'check_circle' : r.status === 'FAILED' ? 'error' : 'progress_activity'
                  }}</i
                >
                <span style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1;text-align:left">
                  <span class="ellipsis" style="font-size:13px;font-weight:600">{{ r.goal.split('\\n')[0] }}</span>
                  <span class="faint" style="font-size:11.5px"
                    >{{
                      r.trigger === 'MANUAL'
                        ? 'Asked by ' + (r.requestedBy?.displayName ?? 'a member')
                        : 'After a meeting'
                    }}
                    · {{ date(r.createdAt) }}</span
                  >
                </span>
              </button>
              @if (openRun()?.id === r.id) {
                @let run = openRun()!;
                <div class="pm-run-detail">
                  @if (run.summary || run.error) {
                    <p class="sm" style="line-height:1.55">{{ run.summary ?? run.error }}</p>
                  }
                  @for (s of run.steps; track s.index) {
                    @if (s.text && s !== run.steps[run.steps.length - 1]) {
                      <span class="faint" style="font-size:12px">{{ s.text }}</span>
                    }
                    @for (c of s.toolCalls; track c.id) {
                      <div class="pm-call">
                        <i class="ms" aria-hidden="true">{{ callIcon(c) }}</i>
                        <span class="grow">{{ c.label }}</span>
                        <span class="mono faint" style="font-size:10.5px">{{ c.status.toLowerCase() }}</span>
                      </div>
                    }
                  }
                </div>
              }
            } @empty {
              <span class="faint sm">No runs yet.</span>
            }
          </section>

          <section class="ws-card" aria-labelledby="mem-h">
            <span class="ws-card-title" id="mem-h">Memory of this project</span>
            <span class="faint" style="font-size:12px"
              >Only used for this project. Remove anything that’s wrong and the AI PM won’t rely on it again.</span
            >
            @for (m of o.memory; track m.id) {
              <div class="pm-mem">
                <span class="mono faint" style="font-size:10.5px;flex-shrink:0;width:86px">{{
                  memoryLabel[m.kind].toUpperCase()
                }}</span>
                <span class="grow" style="font-size:12.5px;line-height:1.5"
                  >{{ m.content }}
                  @if (m.subject) {
                    <span class="faint"> · about {{ m.subject.displayName }}</span>
                  }
                </span>
                <button
                  type="button"
                  class="icon-btn sm"
                  title="Remove this memory"
                  [disabled]="busy()"
                  (click)="forget(m.id)"
                >
                  <i class="ms" aria-hidden="true">close</i>
                </button>
              </div>
            } @empty {
              <span class="faint sm">Empty. The AI PM starts remembering after the first check-in.</span>
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0;min-height:0}'],
})
export class PmComponent implements OnInit {
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly rt = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly pm = signal<PmOverview | null>(null);
  readonly openRun = signal<AgentRunView | null>(null);
  readonly busy = signal(false);
  readonly memoryLabel = MEMORY_LABEL;
  readonly goalMax = AGENT_GOAL_MAX;
  readonly intervals = [1, 2, 3, 4, 5, 7, 10, 14];
  readonly isAdmin = computed(() => this.auth.user()?.role === 'ADMIN');
  readonly running = computed(() =>
    (this.pm()?.runs ?? []).some((r) => r.status === 'QUEUED' || r.status === 'RUNNING'),
  );
  goal = '';
  private timer: ReturnType<typeof setTimeout> | undefined;

  ngOnInit() {
    void this.load();
    const projectId = this.store.overview()?.project.id;
    if (!projectId) return;
    void this.rt.joinProject(projectId);
    const off = this.rt.on<{ projectId: string; runId: string }>(RT_EVENTS.AGENT_UPDATED, (e) => {
      if (e.projectId !== projectId) return;
      void this.load();
      if (this.openRun()?.id === e.runId) void this.loadRun(e.runId);
    });
    this.destroyRef.onDestroy(() => {
      off();
      this.rt.leaveProject(projectId);
      clearTimeout(this.timer);
    });
  }

  private async load() {
    clearTimeout(this.timer);
    try {
      this.pm.set(await this.api.pm(this.store.slug()));
      // Fallback polling while a run is in progress (sockets usually beat it).
      if (this.running()) this.timer = setTimeout(() => void this.load(), 5000);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  private async loadRun(id: string) {
    try {
      this.openRun.set(await this.api.pmRun(id));
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  toggleRun(id: string) {
    if (this.openRun()?.id === id) this.openRun.set(null);
    else void this.loadRun(id);
  }

  async run() {
    this.busy.set(true);
    try {
      await this.api.startPmRun(this.store.slug(), this.goal.trim() || undefined);
      this.goal = '';
      this.toast.ok('The AI PM is on it. Proposals will appear here for approval.');
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async decide(a: AgentToolCallView, approve: boolean) {
    if (approve && !confirm(`Approve: ${a.label}?\n\nThis runs now, as you.`)) return;
    this.busy.set(true);
    try {
      const r = approve ? await this.api.approveProposal(a.id) : await this.api.rejectProposal(a.id);
      if (r.status === 'EXECUTED') this.toast.ok('Done. It’s on the board.');
      else if (r.status === 'FAILED') this.toast.error(`It couldn’t be applied: ${this.errorOf(r)}`);
      else this.toast.ok('Rejected.');
      await Promise.all([this.load(), this.store.refresh()]);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async forget(id: string) {
    this.busy.set(true);
    try {
      await this.api.forgetMemory(this.store.slug(), id);
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async settings(body: { enabled?: boolean; meetingIntervalDays?: number }) {
    try {
      await this.api.pmSettings(this.store.slug(), body);
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  reason(a: AgentToolCallView): string | null {
    const r = (a.input as { reason?: unknown } | null)?.reason;
    return typeof r === 'string' ? `Why: ${r}` : null;
  }

  callIcon(c: AgentToolCallView) {
    if (c.status === 'FAILED') return 'error';
    if (c.status === 'PROPOSED') return 'hourglass_top';
    if (c.status === 'REJECTED') return 'block';
    return c.risk === 'READ' ? 'visibility' : 'edit';
  }

  private errorOf(c: AgentToolCallView) {
    const out = c.result?.output as { error?: string } | undefined;
    return out?.error ?? 'unknown error';
  }

  date(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
}
