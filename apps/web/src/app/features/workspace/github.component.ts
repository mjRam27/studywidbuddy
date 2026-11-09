import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  type OnInit,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import type {
  ChecksStatus,
  CodeReviewView,
  ProjectRepoView,
  PullRequestView,
  ReviewSeverity,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { RealtimeService } from '../../core/realtime.service';
import { ToastService } from '../../core/toast.service';
import { AvatarComponent } from '../../ui/avatar.component';
import { SkeletonComponent } from '../../ui/states.component';
import { WorkspaceStore } from './workspace.store';

const CHECKS: Record<ChecksStatus, { icon: string; label: string; cls: string }> = {
  NONE: { icon: 'radio_button_unchecked', label: 'No CI yet', cls: 'neutral' },
  PENDING: { icon: 'pending', label: 'CI running', cls: 'info' },
  SUCCESS: { icon: 'check_circle', label: 'CI passed', cls: 'ok' },
  FAILURE: { icon: 'cancel', label: 'CI failed', cls: 'danger' },
};

const SEVERITY: Record<ReviewSeverity, { icon: string; cls: string }> = {
  BLOCKER: { icon: 'block', cls: 'danger' },
  MAJOR: { icon: 'warning', cls: 'warn' },
  MINOR: { icon: 'build', cls: 'info' },
  NIT: { icon: 'edit', cls: 'neutral' },
};

/** The AI review of a PR as one status chip (icon + label, never colour alone). */
export function reviewChip(r: CodeReviewView): { icon: string; label: string; cls: string } {
  switch (r.status) {
    case 'QUEUED':
    case 'RUNNING':
      return { icon: 'pending', label: 'AI reviewing', cls: 'info' };
    case 'SKIPPED':
      return { icon: 'do_not_disturb_on', label: 'AI skipped', cls: 'neutral' };
    case 'FAILED':
      return { icon: 'error', label: 'AI review failed', cls: 'danger' };
    default:
      return r.verdict === 'LOOKS_GOOD'
        ? { icon: 'check_circle', label: 'AI: looks good', cls: 'ok' }
        : { icon: 'rate_review', label: 'AI: changes suggested', cls: 'warn' };
  }
}

/** GitHub tab: the team repository, who has access, pull requests linked to tasks and their AI reviews. */
@Component({
  selector: 'sb-ws-github',
  imports: [RouterLink, AvatarComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ws-scroll">
      @if (!v()) {
        <sb-skeleton [rows]="5" [height]="22" />
      } @else {
        @let d = v()!;
        <div class="ws-grid">
          @if (!d.configured) {
            <section class="ws-card wide">
              <div class="banner warn" style="font-size:12.5px">
                <i class="ms" aria-hidden="true">link_off</i>GitHub isn’t connected on this server yet.
              </div>
            </section>
          } @else if (!d.repo) {
            <section class="ws-card wide" aria-labelledby="repo-h">
              <span class="ws-card-title" id="repo-h">Team repository</span>
              @if (d.canCreate) {
                <p class="sm muted">
                  Create the team’s <b>private</b> repository in the platform’s GitHub organization. It comes with a
                  README explaining the task conventions, a CI workflow and a pull request template. Members who’ve
                  connected GitHub get write access straight away.
                </p>
                <button
                  type="button"
                  class="btn btn-primary"
                  style="align-self:flex-start"
                  [disabled]="busy()"
                  (click)="create()"
                >
                  @if (busy()) {
                    <span class="spinner" aria-hidden="true"></span>
                  }
                  <i class="ms" aria-hidden="true">add</i>Create team repository
                </button>
              } @else {
                <p class="sm muted">An admin creates the team repository when the project starts.</p>
              }
            </section>
          } @else {
            @let r = d.repo!;
            <section class="ws-card wide" aria-labelledby="repo-h">
              <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                <span class="ws-card-title" id="repo-h">{{ r.fullName }}</span>
                <span class="status neutral"><i class="ms" aria-hidden="true">lock</i>Private</span>
                <a
                  class="btn btn-secondary xs"
                  style="margin-left:auto"
                  [href]="r.htmlUrl"
                  target="_blank"
                  rel="noopener"
                  ><i class="ms" aria-hidden="true">open_in_new</i>Open on GitHub</a
                >
              </div>
              <div class="gh-clone">
                <code class="mono">git clone {{ r.cloneUrl }}</code>
                <button type="button" class="icon-btn sm" title="Copy" (click)="copy('git clone ' + r.cloneUrl)">
                  <i class="ms" aria-hidden="true">content_copy</i>
                </button>
              </div>
              <div class="gh-rules">
                <span><b>Branch</b> per task: <code class="mono">task-24-short-name</code></span>
                <span><b>PR title</b> starts with the key: <code class="mono">TASK-24: …</code></span>
                <span
                  >The task moves to <b>Review</b> when the PR opens, and to <b>Done</b> when it merges with CI
                  passing.</span
                >
              </div>
            </section>
          }

          @if (d.repo) {
            <section class="ws-card" aria-labelledby="acc-h">
              <div style="display:flex;align-items:center">
                <span class="ws-card-title" id="acc-h">Access</span>
                <button type="button" class="link-btn" style="margin-left:auto" [disabled]="busy()" (click)="sync()">
                  Sync access
                </button>
              </div>
              @for (m of d.members; track m.user.id) {
                <div class="ws-row">
                  <sb-avatar [name]="m.user.displayName" [colorKey]="m.user.id" [size]="24" />
                  <span class="grow">{{ m.user.displayName }}</span>
                  @if (m.githubLogin) {
                    <span class="mono faint" style="font-size:11.5px">&#64;{{ m.githubLogin }}</span>
                    <span class="status ok"><i class="ms" aria-hidden="true">check_circle</i>Write</span>
                  } @else {
                    <span class="status warn"><i class="ms" aria-hidden="true">link_off</i>Not connected</span>
                  }
                </div>
              }
              @if (meUnlinked()) {
                <a class="btn btn-primary xs" style="align-self:flex-start" routerLink="/settings" fragment="github"
                  >Connect your GitHub</a
                >
              }
            </section>

            <section class="ws-card" aria-labelledby="pr-h">
              <span class="ws-card-title" id="pr-h">Pull requests</span>
              @for (p of d.pullRequests; track p.number) {
                <div class="gh-pr">
                  <i class="ms" aria-hidden="true" [style.color]="prColor(p)">{{ prIcon(p) }}</i>
                  <div style="display:flex;flex-direction:column;gap:3px;min-width:0;flex:1">
                    <a
                      class="ellipsis"
                      style="font-size:13px;font-weight:600;color:var(--ink)"
                      [href]="p.htmlUrl"
                      target="_blank"
                      rel="noopener"
                      >#{{ p.number }} {{ p.title }}</a
                    >
                    <span class="faint" style="font-size:11.5px"
                      >{{ p.author.user?.displayName ?? '@' + p.author.login }} · {{ p.headBranch }}
                      @if (p.task) {
                        ·
                        <button
                          type="button"
                          class="link-btn"
                          style="font-size:11.5px"
                          (click)="openTask.emit(p.task.id)"
                        >
                          {{ p.task.key }}
                        </button>
                      } @else {
                        · not linked to a task
                      }
                    </span>
                  </div>
                  <div class="gh-pr-status">
                    <span class="status" [class]="'status ' + checks[p.checks].cls"
                      ><i class="ms" aria-hidden="true">{{ checks[p.checks].icon }}</i
                      >{{ checks[p.checks].label }}</span
                    >
                    @if (p.aiReview; as r) {
                      @let c = chip(r);
                      <span class="status" [class]="'status ' + c.cls" [title]="r.skippedReason ?? ''"
                        ><i class="ms" aria-hidden="true">{{ c.icon }}</i
                        >{{ c.label }}</span
                      >
                    }
                  </div>
                </div>
              } @empty {
                <span class="faint sm">No pull requests yet. Open one titled “TASK-n: …” and it shows up here.</span>
              }
            </section>
          }

          @if (d.repo) {
            <section class="ws-card wide" aria-labelledby="ai-rev-h">
              <span class="ws-card-title" id="ai-rev-h">AI code review</span>
              <span class="faint sm"
                >Every ready pull request gets one review per commit, posted on GitHub as comments. It’s advice: it
                never approves or blocks a merge.</span
              >
              @for (p of reviewed(); track p.number) {
                @let r = p.aiReview!;
                @let c = chip(r);
                <article class="ai-frame gh-review" [attr.aria-label]="'AI review of PR #' + p.number">
                  <div class="gh-review-head">
                    <span class="ai-label"><span class="ai-diamond" aria-hidden="true"></span>AI REVIEWER</span>
                    <span class="sm" style="font-weight:600">#{{ p.number }} {{ p.title }}</span>
                    <span class="status" [class]="'status ' + c.cls"
                      ><i class="ms" aria-hidden="true">{{ c.icon }}</i
                      >{{ c.label }}</span
                    >
                    <span class="mono faint" style="font-size:11px">{{ r.headSha.slice(0, 7) }}</span>
                    <span class="gh-review-actions">
                      @if (r.githubUrl) {
                        <a class="btn btn-secondary xs" [href]="r.githubUrl" target="_blank" rel="noopener"
                          ><i class="ms" aria-hidden="true">open_in_new</i>On GitHub</a
                        >
                      }
                      @if (p.state === 'OPEN' && r.status !== 'QUEUED' && r.status !== 'RUNNING') {
                        <button type="button" class="btn btn-ghost xs" [disabled]="busy()" (click)="rerun(p.number)">
                          <i class="ms" aria-hidden="true">refresh</i>Run again
                        </button>
                      }
                    </span>
                  </div>
                  @if (r.summary) {
                    <p class="sm" style="line-height:1.6;margin:0">{{ r.summary }}</p>
                  } @else if (r.failureReason || r.skippedReason) {
                    <p class="sm muted" style="margin:0">{{ r.failureReason ?? r.skippedReason }}</p>
                  }
                  @if (r.findings.length) {
                    <ul class="gh-findings">
                      @for (f of r.findings; track f.path + f.line + f.title) {
                        <li>
                          <span class="status" [class]="'status ' + severity[f.severity].cls"
                            ><i class="ms" aria-hidden="true">{{ severity[f.severity].icon }}</i
                            >{{ f.severity.toLowerCase() }}</span
                          >
                          <div class="gh-finding">
                            <span class="sm" style="font-weight:600">{{ f.title }}</span>
                            <span class="mono faint" style="font-size:11px"
                              >{{ f.path }}:{{ f.line }} · {{ f.category.toLowerCase().replace('_', ' ') }}</span
                            >
                            <span class="sm muted">{{ f.body }}</span>
                          </div>
                        </li>
                      }
                    </ul>
                  }
                  @if (r.status === 'POSTED') {
                    <span class="faint" style="font-size:11.5px"
                      >Reviewed {{ r.filesReviewed }} file{{ r.filesReviewed === 1 ? '' : 's' }}
                      @if (r.filesSkipped) {
                        · skipped {{ r.filesSkipped }} (lockfiles, generated or binary)
                      }
                    </span>
                  }
                </article>
              } @empty {
                <span class="faint sm">No reviews yet. Open a pull request (not a draft) to get one.</span>
              }
              <span class="faint sm"
                >Acceptance tests in a sandbox <span class="status neutral" style="margin-left:4px">SOON</span></span
              >
            </section>
          }
        </div>
      }
    </div>
  `,
  styles: [
    `
      :host {
        flex: 1;
        display: flex;
        min-width: 0;
      }
      .gh-clone {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        border: 1px solid var(--line);
        border-radius: 8px;
        background: var(--canvas);
        font-size: 12.5px;
        overflow-x: auto;
      }
      .gh-rules {
        display: flex;
        flex-direction: column;
        gap: 4px;
        font-size: 12.5px;
        color: var(--ink-2);
      }
      .gh-pr {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        border-top: 1px solid var(--line-soft);
      }
    `,
  ],
})
export class GithubTabComponent implements OnInit {
  readonly store = inject(WorkspaceStore);
  private readonly api = inject(Api);
  private readonly auth = inject(AuthService);
  private readonly rt = inject(RealtimeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly openTask = output<string>();
  readonly v = signal<ProjectRepoView | null>(null);
  readonly busy = signal(false);
  readonly checks = CHECKS;
  readonly severity = SEVERITY;
  readonly chip = reviewChip;
  /** PRs with an AI review, open ones first. */
  readonly reviewed = computed(() =>
    (this.v()?.pullRequests ?? [])
      .filter((p) => p.aiReview)
      .sort((a, b) => Number(b.state === 'OPEN') - Number(a.state === 'OPEN'))
      .slice(0, 10),
  );
  readonly meUnlinked = computed(() => {
    const me = this.auth.user()?.id;
    return !!this.v()?.members.find((m) => m.user.id === me && !m.githubLogin);
  });

  ngOnInit() {
    void this.load();
    const projectId = this.store.overview()?.project.id;
    if (!projectId) return;
    void this.rt.joinProject(projectId);
    const off = this.rt.on<{ projectId: string }>('github:updated', (e) => {
      if (e.projectId === projectId) {
        void this.load();
        void this.store.refresh();
      }
    });
    this.destroyRef.onDestroy(() => {
      off();
      this.rt.leaveProject(projectId);
    });
  }

  private async load() {
    try {
      this.v.set(await this.api.projectGithub(this.store.slug()));
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async create() {
    if (!confirm('Create the private team repository on GitHub now?')) return;
    this.busy.set(true);
    try {
      this.v.set(await this.api.createProjectRepo(this.store.slug()));
      this.toast.ok('Repository created. Members with GitHub connected have access.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async sync() {
    this.busy.set(true);
    try {
      const r = await this.api.syncProjectRepo(this.store.slug());
      this.toast.ok(
        r.pending
          ? `${r.added} with access, ${r.pending} invited (they accept the GitHub email).`
          : 'Access is up to date.',
      );
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  async rerun(number: number) {
    this.busy.set(true);
    try {
      await this.api.rerunReview(this.store.slug(), number);
      this.toast.ok('AI review queued. It shows here and on GitHub in a minute or two.');
      await this.load();
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }

  copy(text: string) {
    void navigator.clipboard?.writeText(text).then(() => this.toast.ok('Copied.'));
  }

  prIcon(p: PullRequestView) {
    return p.state === 'MERGED' ? 'merge' : p.state === 'CLOSED' ? 'block' : p.draft ? 'edit_note' : 'call_split';
  }
  prColor(p: PullRequestView) {
    return p.state === 'MERGED' ? '#A78BFA' : p.state === 'CLOSED' ? 'var(--ink-3)' : 'var(--success)';
  }
}
