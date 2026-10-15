import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectDetail, SelectionRunView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

/**
 * Admin team selection (new screen). The algorithm proposes; a person approves. Applying is
 * a high-impact action, so it goes through the approval card from the AI visual language.
 */
@Component({
  selector: 'sb-team-selection-page',
  imports: [RouterLink, TopbarComponent, AvatarComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/projects">Projects</a><i class="ms" aria-hidden="true">chevron_right</i>
        <a [routerLink]="['/projects', slug()]" class="ellipsis">{{ project()?.title ?? 'Project' }}</a
        ><i class="ms" aria-hidden="true">chevron_right</i>
        <b>Team selection</b>
      </nav>
      <span class="badge neutral" style="margin-left:auto">ADMIN</span>
    </sb-topbar>
    <div class="page narrow">
      @if (error()) {
        <sb-error-state [error]="error()" (retry)="load()" />
      } @else if (!project()) {
        <sb-skeleton [rows]="6" [height]="20" />
      } @else {
        @let p = project()!;
        <div class="page-head">
          <div class="page-head-text">
            <span class="eyebrow">STEP 4 OF 4 · TEAM SELECTION</span>
            <h1>{{ p.title }}</h1>
            <span class="subline">
              Fills every role with a balanced team from evaluated applicants: interview result, skill coverage, role
              preference and availability. Hardest roles are filled first.
            </span>
          </div>
          <div class="page-head-actions">
            <button
              type="button"
              class="btn btn-secondary lg"
              [disabled]="busy() || p.status !== 'OPEN'"
              (click)="propose()"
            >
              @if (busy() === 'propose') {
                <span class="spinner" aria-hidden="true"></span>
              }
              <i class="ms" aria-hidden="true">refresh</i>{{ run() ? 'Run again' : 'Run selection' }}
            </button>
          </div>
        </div>

        @if (p.status !== 'OPEN' && !run()) {
          <div class="banner">
            <i class="ms" aria-hidden="true">info</i>This project isn’t recruiting, so there is nothing to select.
          </div>
        }

        @if (run(); as r) {
          <section class="panel pad-lg" aria-labelledby="cov-h">
            <div class="panel-head">
              <span class="panel-title" id="cov-h">Role coverage</span>
              <span class="faint sm" style="margin-left:auto">{{ r.summary }}</span>
            </div>
            <div class="sel-roles">
              @for (role of r.roles; track role.id) {
                <div class="sel-role">
                  <span class="grow">{{ role.title }}</span>
                  <span class="seats" [attr.aria-label]="role.selected + ' of ' + role.seats + ' seats proposed'">
                    @for (s of seatsOf(role.seats); track $index) {
                      <span [class.filled]="$index < role.selected"></span>
                    }
                  </span>
                  <span class="mono faint" style="font-size:12px">{{ role.selected }}/{{ role.seats }}</span>
                </div>
              }
            </div>
          </section>

          @if (r.status === 'PROPOSED') {
            <section class="ai-frame sel-approval" aria-labelledby="ap-h">
              <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <span class="status info"><i class="ms" aria-hidden="true">lightbulb</i>PROPOSED</span>
                <span class="status warn"><i class="ms" aria-hidden="true">hourglass_top</i>NEEDS APPROVAL</span>
              </div>
              <span class="panel-title" id="ap-h">Form this team</span>
              <span class="muted sm" style="line-height:1.5">
                Impact: {{ selectedCount() }} people are invited to the team; {{ notSelectedCount() }} application{{
                  notSelectedCount() === 1 ? '' : 's'
                }}
                close as not selected, each with the reasons below. The project moves to in progress. This can’t be
                undone.
              </span>
              <div style="display:flex;gap:8px">
                <button
                  type="button"
                  class="btn btn-primary"
                  [disabled]="!!busy() || selectedCount() === 0"
                  (click)="apply()"
                >
                  @if (busy() === 'apply') {
                    <span class="spinner" aria-hidden="true"></span>
                  }
                  Approve and form team
                </button>
                <button type="button" class="btn btn-ghost" [disabled]="!!busy()" (click)="propose()">Re-run</button>
              </div>
            </section>
          } @else if (r.status === 'APPLIED') {
            <div class="banner" role="status">
              <i class="ms" aria-hidden="true" style="color:var(--success)">verified_user</i>
              <span>Applied {{ appliedAt() }}. Selected people have been invited.</span>
            </div>
          }

          <section class="panel" style="padding:0;overflow:hidden" aria-labelledby="cand-h">
            <div class="sel-row head" id="cand-h">
              <span>CANDIDATE</span><span>APPLIED FOR</span><span>INTERVIEW</span><span>FIT</span><span>DECISION</span>
            </div>
            @for (c of r.candidates; track c.applicationId) {
              <div class="sel-row">
                <span class="sel-person">
                  <sb-avatar [name]="c.user.displayName" [colorKey]="c.user.id" [size]="28" />
                  <span style="display:flex;flex-direction:column;min-width:0">
                    <span class="ellipsis" style="font-weight:600">{{ c.user.displayName }}</span>
                    <span class="faint" style="font-size:11.5px">{{ c.hoursPerWeek }} h/week</span>
                  </span>
                </span>
                <span class="muted">{{ c.appliedRole.title }}</span>
                <span>
                  @if (c.evaluation; as e) {
                    <span class="mono" style="font-weight:600">{{ e.overall }}</span>
                    <span class="faint" style="font-size:11.5px">
                      T{{ e.technical }} · P{{ e.problemSolving }} · C{{ e.communication }} · F{{ e.projectFit }}</span
                    >
                  } @else {
                    <span class="faint">—</span>
                  }
                </span>
                <span class="mono">{{ pct(c.decision.fit) }}</span>
                <span>
                  @if (c.decision.selected) {
                    <span class="status ok"
                      ><i class="ms" aria-hidden="true">check_circle</i>{{ c.decision.role?.title }}</span
                    >
                  } @else {
                    <span class="status neutral"
                      ><i class="ms" aria-hidden="true">do_not_disturb_on</i>Not selected</span
                    >
                  }
                </span>
                <details class="sel-reasons">
                  <summary>Why</summary>
                  <ul>
                    @for (why of c.decision.reasons; track $index) {
                      <li>{{ why }}</li>
                    }
                  </ul>
                </details>
              </div>
            } @empty {
              <div class="empty" style="border:0">
                <span class="empty-text"
                  >No applications are under review yet. Candidates appear here after their interview is
                  evaluated.</span
                >
              </div>
            }
          </section>
        } @else if (!busy() && p.status === 'OPEN') {
          <div class="empty dashed">
            <span class="empty-title">No selection yet</span>
            <span class="empty-text"
              >Run the selection to see a proposed team. Nothing changes for applicants until you approve it.</span
            >
          </div>
        }
      }
    </div>
  `,
})
export class TeamSelectionPage {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  readonly project = signal<ProjectDetail | null>(null);
  readonly run = signal<SelectionRunView | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly busy = signal<'propose' | 'apply' | null>(null);

  readonly selectedCount = computed(() => this.run()?.candidates.filter((c) => c.decision.selected).length ?? 0);
  readonly notSelectedCount = computed(() => (this.run()?.candidates.length ?? 0) - this.selectedCount());
  readonly appliedAt = computed(() => {
    const at = this.run()?.appliedAt;
    return at
      ? new Date(at).toLocaleString('en', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
      : '';
  });

  constructor() {
    effect(() => {
      this.slug();
      untracked(() => void this.load());
    });
  }

  pct = (n: number) => `${Math.round(n * 100)}%`;
  seatsOf = (n: number) => Array.from({ length: n });

  async load() {
    this.error.set(null);
    try {
      const p = await this.api.project(this.slug());
      this.project.set(p);
      try {
        this.run.set(await this.api.latestSelection(p.id));
      } catch (e) {
        if (toApiError(e).status !== 404) throw e;
        this.run.set(null);
      }
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  async propose() {
    const p = this.project();
    if (!p) return;
    this.busy.set('propose');
    try {
      this.run.set(await this.api.proposeSelection(p.id));
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(null);
    }
  }

  async apply() {
    const r = this.run();
    if (!r || !confirm(`Form the team? ${this.selectedCount()} people will be invited and other applications closed.`))
      return;
    this.busy.set('apply');
    try {
      this.run.set(await this.api.applySelection(r.id));
      this.toast.ok('Team formed. Invitations are out.');
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
      await this.load();
    } finally {
      this.busy.set(null);
    }
  }
}
