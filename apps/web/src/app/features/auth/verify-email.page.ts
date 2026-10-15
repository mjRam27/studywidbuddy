import { ChangeDetectionStrategy, Component, inject, input, type OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'sb-verify-email-page',
  imports: [RouterLink, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-auth-layout headline="Almost there." [alt]="auth.user() ? 'register' : 'login'">
      @switch (state()) {
        @case ('working') {
          <div class="result-icon info" aria-hidden="true"><span class="spinner"></span></div>
          <h2>Confirming your email…</h2>
        }
        @case ('ok') {
          <div class="result-icon ok" aria-hidden="true"><i class="ms">verified</i></div>
          <div>
            <h2>Email confirmed</h2>
            <p class="lead">Thanks. You can now apply to projects.</p>
          </div>
          <a class="btn btn-primary lg block" [routerLink]="auth.user() ? '/home' : '/login'">Continue</a>
        }
        @case ('error') {
          <div class="result-icon bad" aria-hidden="true"><i class="ms">link_off</i></div>
          <div>
            <h2>That link didn’t work</h2>
            <p class="lead">{{ message() }}</p>
          </div>
          @if (auth.user()) {
            <a class="btn btn-primary lg block" routerLink="/settings">Send a new link from Settings</a>
          } @else {
            <a class="btn btn-primary lg block" routerLink="/login">Log in to request a new link</a>
          }
        }
      }
    </sb-auth-layout>
  `,
})
export class VerifyEmailPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  readonly token = input<string | undefined>();
  readonly state = signal<'working' | 'ok' | 'error'>('working');
  readonly message = signal('');

  async ngOnInit() {
    const token = this.token();
    if (!token) {
      this.message.set('The link is missing its code. Open it from your email again.');
      this.state.set('error');
      return;
    }
    try {
      await this.api.verifyEmail(token);
      if (this.auth.user()) this.auth.patchUser({ emailVerified: true });
      this.state.set('ok');
    } catch (e) {
      this.message.set(toApiError(e).message);
      this.state.set('error');
    }
  }
}
