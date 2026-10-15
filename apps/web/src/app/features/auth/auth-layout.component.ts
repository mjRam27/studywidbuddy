import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BrandComponent } from '../../ui/brand.component';

/** Public header + two-column auth layout (pitch on the left, form card on the right). */
@Component({
  selector: 'sb-auth-layout',
  imports: [RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <header class="public-header">
        <div class="public-header-inner">
          <sb-brand link="/" />
          <nav class="public-nav" aria-label="Public">
            <a routerLink="/" fragment="how">How it works</a>
            <a routerLink="/" fragment="projects">Projects</a>
          </nav>
          <div class="public-header-end">
            @if (alt() === 'login') {
              <span class="faint sm">Have an account?</span><a class="plain" routerLink="/login">Log in</a>
            } @else {
              <a class="btn btn-ink" routerLink="/register">Start Learning</a>
            }
          </div>
        </div>
      </header>
      <div class="auth-grid">
        <section class="auth-aside" aria-hidden="true">
          <h1>{{ headline() }}</h1>
          <p>
            Get matched with someone learning the same thing at your level. Study together, then turn what you’ve
            learned into real project experience.
          </p>
          <div class="auth-loops">
            <div class="auth-loop">
              <span class="shape" style="border-radius:50%;background:var(--brand)"></span><b>Learn</b
              ><span>Study Buddy, shared workspace, AI that knows your lesson</span>
            </div>
            <div class="auth-loop">
              <span class="shape" style="border-radius:2px;background:var(--ai)"></span><b>Build</b
              ><span>Apply, interview, join a team, ship a project</span>
            </div>
            <div class="auth-loop">
              <span
                class="shape"
                style="width:0;height:0;border-left:5px solid transparent;border-right:5px solid transparent;border-bottom:9px solid var(--grow)"
              ></span
              ><b>Grow</b><span>Proof on your profile, jobs that match it</span>
            </div>
          </div>
        </section>
        <section class="auth-card">
          <ng-content />
        </section>
      </div>
    </div>
  `,
})
export class AuthLayoutComponent {
  readonly headline = input('Don’t learn alone.');
  /** Which link the header shows: to log in, or to register. */
  readonly alt = input<'login' | 'register'>('register');
}
