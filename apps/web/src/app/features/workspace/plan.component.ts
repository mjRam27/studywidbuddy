import { ChangeDetectionStrategy, Component, DestroyRef, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AiStatus, PlanProposalView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { asyncState } from '../../core/resource';
import { ToastService } from '../../core/toast.service';
import { PRIORITY_META } from './workspace-meta';
import { WorkspaceStore } from './workspace.store';

/**
 * Planning: sprints by hand, or an AI PM proposal that must be approved. The proposal sits
 * in a dashed AI frame; nothing is created until someone presses Approve.
 */
@Component({
  selector: 'sb-ws-plan',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      <div class="ws-grid">
        <section class="ws-card wide" aria-labelledby="ai-h">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span class="ai-label" id="ai-h"
              ><span class="ai-diamond" aria-hidden="true"></span>AI PM · PLAN PROPOSAL</span
            >
            <span class="faint" style="font-size:12px"
              >Milestones, sprints, tasks and dependencies, validated before you see them.</span
            >
            @if (ai.value()?.configured !== false) {
              <button
                type="button"
                class="btn btn-secondary xs"
                style="margin-left:auto"
                [disabled]="busy() || plan()?.status === 'GENERATING'"
                (click)="request()"
              >
                <i class="ms" aria-hidden="true">auto_awesome</i
                >{{ plan() ? 'Ask for a new plan' : 'Ask the AI PM for a plan' }}
              </button>
            }
          </div>
          @if (ai.value()?.configured === false) {
            <div class="banner warn" style="font-size:12.5px">
              <i class="ms" aria-hidden="true">cloud_off</i>AI planning isn’t available on this server yet. Plan sprints
              and tasks by hand below.
            </div>
          }
          @switch (plan()?.status) {
            @case ('GENERATING') {
              <div class="ai-frame" style="display:flex;align-items:center;gap:10px" aria-live="polite">
                <span class="spinner" aria-hidden="true"></span>The AI PM is drafting a plan from the project brief and
                roles…
              </div>
            }
            @case ('FAILED') {
              <div class="banner danger">
                <i class="ms" aria-hidden="true">sync_problem</i><span class="grow">{{ plan()!.failureMessage }}</span
                ><button type="button" class="btn btn-secondary xs" (click)="discard()">Dismiss</button>
              </div>
            }
            @case ('PROPOSED') {
              @let p = plan()!.plan!;
              <div class="ai-frame" style="display:flex;flex-direction:column;gap:12px">
                <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                  <span class="status info"><i class="ms" aria-hidden="true">lightbulb</i>RECOMMENDED</span>
                  <span class="status warn"><i class="ms" aria-hidden="true">hourglass_top</i>NEEDS APPROVAL</span>
                </div>
                <p class="sm" style="line-height:1.55;color:#d3d7e2">{{ p.rationale }}</p>
                <div class="tfacts" style="grid-template-columns:110px 1fr">
                  <span>Impact</span
                  ><span
                    >Creates {{ p.tasks.length }} tasks, {{ p.sprints.length }} sprints and
                    {{ p.milestones.length }} milestones, added after what exists.</span
                  >
                  <span>Milestones</span><span>{{ milestoneList(p) }}</span>
                </div>
                @for (s of p.sprints; track s.number) {
                  <div>
                    <span class="section-label"
                      >SPRINT {{ s.number }} · {{ s.durationDays }} DAYS · {{ s.goal.toUpperCase() }}</span
                    >
                    @for (t of tasksIn(p, s.number); track t.key) {
                      <div class="plan-task">
                        <span class="mono faint" style="font-size:11px">{{ t.key }}</span>
                        <span>
                          {{ t.title }}
                          @if (t.dependsOn.length) {
                            <span class="faint" style="font-size:11.5px"> · after {{ t.dependsOn.join(', ') }}</span>
                          }
                        </span>
                        <span class="faint" style="font-size:12px"
                          >{{ t.roleKey ?? 'shared' }} ·
                          <span [class]="'prio ' + t.priority">{{ prio[t.priority].label }}</span></span
                        >
                        <span class="mono" style="font-size:12px;text-align:right">{{ t.estimate }} pts</span>
                      </div>
                    }
                  </div>
                }
                <div style="display:flex;gap:8px;align-items:center">
                  <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="apply()">
                    Approve and create
                  </button>
                  <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="discard()">Reject</button>
                  <span class="faint" style="margin-left:auto;font-size:11.5px"
                    >Nothing changes until someone approves</span
                  >
                </div>
              </div>
            }
            @case ('APPLIED') {
              <span class="sm" style="color:var(--success)"
                ><i class="ms" aria-hidden="true" style="font-size:15px">check_circle</i> The last proposal was approved
                and its tasks are on the board.</span
              >
            }
          }
        </section>

        <section class="ws-card" aria-labelledby="sp-h">
          <span class="ws-card-title" id="sp-h">Sprints</span>
          @for (s of store.overview()?.sprints ?? []; track s.id) {
            <div class="ws-row">
              <span class="key">S{{ s.number }}</span>
              <span class="grow ellipsis">{{ s.goal }}</span>
              <span class="faint" style="font-size:11.5px">{{ s.points.done }}/{{ s.points.total }} pts</span>
              @if (s.status === 'PLANNED') {
                <button
                  type="button"
                  class="btn btn-secondary xs"
                  [disabled]="busy() || !!store.overview()?.activeSprint"
                  (click)="startSprint(s.id)"
                >
                  Start
                </button>
              } @else if (s.status === 'ACTIVE') {
                <button type="button" class="btn btn-secondary xs" [disabled]="busy()" (click)="completeSprint(s.id)">
                  Complete
                </button>
              } @else {
                <span class="status ok"><i class="ms" aria-hidden="true">check_circle</i>Done</span>
              }
            </div>
          } @empty {
            <span class="faint sm">No sprints yet.</span>
          }
        </section>

        <section class="ws-card" aria-labelledby="ns-h">
          <span class="ws-card-title" id="ns-h">New sprint</span>
          <form class="form-stack" style="gap:10px" (ngSubmit)="createSprint()">
            <div class="field">
              <label for="s-goal">Goal</label
              ><input
                id="s-goal"
                class="input"
                name="goal"
                [(ngModel)]="goal"
                placeholder="e.g. Realtime tracking + token rotation"
              />
            </div>
            <div class="form-row">
              <div class="field">
                <label for="s-start">Starts</label
                ><input id="s-start" class="input" type="date" name="start" [(ngModel)]="start" />
              </div>
              <div class="field">
                <label for="s-end">Ends</label
                ><input id="s-end" class="input" type="date" name="end" [(ngModel)]="end" />
              </div>
            </div>
            <button
              type="submit"
              class="btn btn-primary"
              style="align-self:flex-start"
              [disabled]="busy() || goal.trim().length < 3 || !start || !end"
            >
              Add sprint
            </button>
          </form>
        </section>
      </div>
    </div>
  `,
  styles: [':host{flex:1;display:flex;min-width:0}'],
})
export class PlanComponent implements OnInit {
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly ai = asyncState<AiStatus>(() => this.api.aiStatus());
  readonly plan = signal<PlanProposalView | null>(null);
  readonly busy = signal(false);
  readonly prio = PRIORITY_META;
  goal = '';
  start = new Date().toISOString().slice(0, 10);
  end = new Date(Date.now() + 13 * 86_400_000).toISOString().slice(0, 10);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  ngOnInit() {
    void this.loadPlan();
  }

  tasksIn(p: NonNullable<PlanProposalView['plan']>, sprint: number) {
    return p.tasks.filter((t) => t.sprintNumber === sprint);
  }

  milestoneList(p: NonNullable<PlanProposalView['plan']>) {
    return p.milestones.map((m) => `${m.title} (day ${m.dueInDays})`).join(' · ');
  }

  private async loadPlan() {
    try {
      const p = await this.api.latestPlan(this.store.slug());
      this.plan.set(p);
      clearTimeout(this.timer);
      if (p.status === 'GENERATING') this.timer = setTimeout(() => void this.loadPlan(), 3000);
    } catch (e) {
      if (toApiError(e).status !== 404) this.toast.error(toApiError(e).message);
      this.plan.set(null);
    }
  }

  private async run(op: () => Promise<unknown>, done?: string) {
    this.busy.set(true);
    try {
      await op();
      if (done) this.toast.ok(done);
      await Promise.all([this.loadPlan(), this.store.refresh()]);
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  request() {
    void this.run(() => this.api.requestPlan(this.store.slug()));
  }
  apply() {
    if (!confirm('Approve this plan? Its milestones, sprints and tasks will be created.')) return;
    void this.run(() => this.api.applyPlan(this.plan()!.id), 'Plan approved. Tasks are on the board.');
  }
  discard() {
    void this.run(() => this.api.discardPlan(this.plan()!.id), 'Plan rejected.');
  }
  startSprint(id: string) {
    void this.run(() => this.api.startSprint(id), 'Sprint started.');
  }
  completeSprint(id: string) {
    if (!confirm('Complete this sprint? Unfinished tasks move to the next planned sprint.')) return;
    void this.run(() => this.api.completeSprint(id), 'Sprint completed.');
  }
  createSprint() {
    void this.run(async () => {
      await this.api.createSprint(this.store.slug(), {
        goal: this.goal.trim(),
        startsAt: new Date(this.start + 'T09:00:00').toISOString(),
        endsAt: new Date(this.end + 'T18:00:00').toISOString(),
      });
      this.goal = '';
    }, 'Sprint added.');
  }
}
