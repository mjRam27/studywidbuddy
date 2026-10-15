import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth.service';
import { LearningStore } from '../core/learning.store';
import { TeamsStore } from '../core/teams.store';
import { AvatarComponent } from '../ui/avatar.component';
import { BrandComponent } from '../ui/brand.component';
import { ClickOutsideDirective } from '../ui/click-outside.directive';
import { ShellService } from './shell.service';

interface NavItem {
  id: string;
  icon: string;
  label: string;
  path: string;
  /** Shown for sections that aren't built yet, so nobody mistakes them for working features. */
  soon?: string;
}

const NAV: NavItem[] = [
  { id: 'home', icon: 'home', label: 'Home', path: '/home' },
  { id: 'learn', icon: 'school', label: 'Learn', path: '/learn' },
  { id: 'projects', icon: 'deployed_code', label: 'Projects', path: '/projects' },
  { id: 'people', icon: 'group', label: 'People', path: '/people', soon: 'SOON' },
  { id: 'messages', icon: 'forum', label: 'Messages', path: '/messages', soon: 'SOON' },
  { id: 'jobs', icon: 'work', label: 'Jobs', path: '/jobs', soon: 'SOON' },
];

/** Layer 1 navigation: six destinations + AI Buddy. Learn expands to your live course workspaces. */
@Component({
  selector: 'sb-sidebar',
  imports: [RouterLink, AvatarComponent, BrandComponent, ClickOutsideDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="sidebar" [class.open]="shell.sidebarOpen()" aria-label="Main navigation">
      <sb-brand />
      <nav style="display:flex;flex-direction:column;gap:2px">
        @for (n of nav; track n.id) {
          <a
            class="nav-item"
            [class.on]="active() === n.id"
            [routerLink]="n.path"
            [attr.aria-current]="active() === n.id ? 'page' : null"
            (click)="shell.close()"
          >
            <i class="ms" aria-hidden="true">{{ n.icon }}</i>
            <span class="grow">{{ n.label }}</span>
            @if (n.soon) {
              <span class="nav-tag">{{ n.soon }}</span>
            }
          </a>
          @if (n.id === 'learn' && active() === 'learn' && learning.active().length) {
            <div class="nav-sub">
              @for (e of learning.active(); track e.id) {
                <a [routerLink]="['/learn/courses', e.course.slug]" (click)="shell.close()">
                  <span class="dot" aria-hidden="true"></span>
                  <span class="grow ellipsis">{{ e.course.title }}</span>
                  <span class="mono">{{ e.progress }}%</span>
                </a>
              }
            </div>
          }
          @if (n.id === 'projects' && active() === 'projects' && teams.memberships().length) {
            <div class="nav-sub">
              @for (m of teams.memberships(); track m.memberId) {
                <a
                  [routerLink]="
                    m.status === 'ACTIVE' ? ['/projects', m.project.slug, 'workspace'] : ['/projects', m.project.slug]
                  "
                  (click)="shell.close()"
                >
                  <span class="dot" style="border-radius:1px;background:var(--ai)" aria-hidden="true"></span>
                  <span class="grow ellipsis">{{ m.project.title }}</span>
                  <span class="mono">{{
                    m.status === 'INVITED' ? 'INVITE' : m.role.title.split(' ')[0].toUpperCase()
                  }}</span>
                </a>
              }
            </div>
          }
        }
      </nav>
      <div class="side-divider"></div>
      <button type="button" class="ai-entry" disabled title="AI Buddy arrives with the Study Workspace">
        <span class="ai-diamond" style="margin:0 6px 0 5px" aria-hidden="true"></span>
        <span class="grow">AI Buddy</span>
        <span class="nav-tag">SOON</span>
      </button>
      <div class="side-foot">
        <a class="nav-item" routerLink="/settings" [class.on]="active() === 'settings'" (click)="shell.close()">
          <i class="ms" aria-hidden="true">settings</i>Settings
        </a>
        @if (auth.user(); as u) {
          <div style="position:relative" (sbClickOutside)="menuOpen.set(false)">
            <button
              type="button"
              class="side-user"
              (click)="menuOpen.set(!menuOpen())"
              [attr.aria-expanded]="menuOpen()"
              aria-haspopup="menu"
            >
              <sb-avatar [name]="u.displayName" [src]="u.avatarUrl" [self]="true" />
              <span class="side-user-text">
                <span class="name ellipsis">{{ u.displayName }}</span>
                <span class="handle ellipsis">&#64;{{ u.username }}</span>
              </span>
            </button>
            @if (menuOpen()) {
              <div class="menu" role="menu" style="bottom:48px;left:0;right:0">
                <a role="menuitem" [routerLink]="['/u', u.username]" (click)="menuOpen.set(false); shell.close()">
                  <i class="ms" aria-hidden="true">person</i>View profile
                </a>
                <a role="menuitem" routerLink="/settings" (click)="menuOpen.set(false); shell.close()">
                  <i class="ms" aria-hidden="true">settings</i>Settings
                </a>
                <div class="menu-sep"></div>
                <button type="button" role="menuitem" (click)="auth.logout()">
                  <i class="ms" aria-hidden="true">logout</i>Sign out
                </button>
              </div>
            }
          </div>
        }
      </div>
    </aside>
    @if (shell.sidebarOpen()) {
      <div class="sidebar-scrim" (click)="shell.close()" aria-hidden="true"></div>
    }
  `,
  styles: [':host{display:contents}'],
})
export class SidebarComponent {
  readonly auth = inject(AuthService);
  readonly learning = inject(LearningStore);
  readonly teams = inject(TeamsStore);
  readonly shell = inject(ShellService);
  private readonly router = inject(Router);

  readonly nav = NAV;
  readonly menuOpen = signal(false);

  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  readonly active = computed(() => {
    const seg = this.url().split(/[/?#]/)[1] ?? '';
    if (seg === 'applications') return 'projects';
    if (seg === 'u') return 'people';
    return seg;
  });
}
