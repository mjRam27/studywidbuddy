import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import type { GithubStatus } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { ToastService } from '../../core/toast.service';

const RESULT: Record<string, { ok: boolean; text: string }> = {
  linked: { ok: true, text: 'GitHub connected. You now have access to your teams’ repositories.' },
  taken: { ok: false, text: 'That GitHub account is already connected to another StudywidBuddy account.' },
  expired: { ok: false, text: 'The GitHub sign-in took too long. Please try again.' },
  error: { ok: false, text: 'GitHub sign-in didn’t complete. Please try again.' },
};

/** Settings → Connected accounts. Linking GitHub gives write access to team repositories. */
@Component({
  selector: 'sb-github-connect',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="panel pad-lg" id="github" aria-labelledby="gh-h">
      <span class="panel-title" id="gh-h">Connected accounts</span>
      <div class="gh-row">
        <span class="gh-mark" aria-hidden="true"><i class="ms">code</i></span>
        <div style="display:flex;flex-direction:column;gap:2px;min-width:0;flex:1">
          <span style="font-weight:600">GitHub</span>
          @if (!status()) {
            <span class="faint sm">Checking…</span>
          } @else if (!status()!.configured) {
            <span class="faint sm">GitHub isn’t connected on this server yet.</span>
          } @else if (status()!.account) {
            @let a = status()!.account!;
            <span class="sm"
              >Connected as <b>&#64;{{ a.login }}</b
              >. You get write access to your project teams’ repositories in {{ status()!.org }}.</span
            >
          } @else {
            <span class="faint sm"
              >Connect your GitHub account to get access to your project team’s repository. We only store your GitHub
              username and id.</span
            >
          }
        </div>
        @if (status()?.configured) {
          @if (status()!.account) {
            <button type="button" class="btn btn-ghost xs" [disabled]="busy()" (click)="unlink()">Disconnect</button>
          } @else {
            <button type="button" class="btn btn-primary xs" [disabled]="busy()" (click)="connect()">
              Connect GitHub
            </button>
          }
        }
      </div>
    </section>
  `,
  styles: [
    `
      .gh-row {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      .gh-mark {
        width: 36px;
        height: 36px;
        border-radius: 8px;
        background: var(--subtle);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
      }
    `,
  ],
})
export class GithubConnectComponent implements OnInit {
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly status = signal<GithubStatus | null>(null);
  readonly busy = signal(false);

  async ngOnInit() {
    // Back from GitHub: show the outcome once, then clean the URL.
    const result = this.route.snapshot.queryParamMap.get('github');
    if (result && RESULT[result]) {
      const r = RESULT[result];
      if (r.ok) this.toast.ok(r.text);
      else this.toast.error(r.text);
      void this.router.navigate([], { queryParams: { github: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
    try {
      this.status.set(await this.api.githubStatus());
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  async connect() {
    this.busy.set(true);
    try {
      const { url } = await this.api.connectGithub();
      window.location.assign(url);
    } catch (e) {
      this.toast.error(toApiError(e).message);
      this.busy.set(false);
    }
  }

  async unlink() {
    if (!confirm('Disconnect GitHub? You keep repository access until an admin re-syncs the team.')) return;
    this.busy.set(true);
    try {
      await this.api.unlinkGithub();
      this.status.set(await this.api.githubStatus());
      this.toast.ok('GitHub disconnected.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
