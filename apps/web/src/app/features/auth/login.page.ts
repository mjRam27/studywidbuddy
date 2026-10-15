import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { AuthLayoutComponent } from './auth-layout.component';
import { safeReturnUrl } from './return-url';

@Component({
  selector: 'sb-login-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-auth-layout headline="Welcome back." alt="register">
      <div>
        <h2>Log in</h2>
        <p class="lead">Pick up where you left off.</p>
      </div>
      <form class="form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as e) {
          <div class="banner danger" role="alert">
            <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
          </div>
        }
        <div class="field">
          <label for="email">Email</label>
          <input
            id="email"
            class="input"
            type="email"
            autocomplete="email"
            formControlName="email"
            [class.invalid]="showErr('email')"
          />
          @if (showErr('email')) {
            <span class="field-error"
              ><i class="ms" aria-hidden="true">error</i>Enter a full email address, like name&#64;uni.edu</span
            >
          }
        </div>
        <div class="field">
          <div style="display:flex;align-items:baseline">
            <label for="password" class="field-label">Password</label>
            <a routerLink="/forgot-password" class="sm" style="margin-left:auto">Forgot password?</a>
          </div>
          <div class="pw-wrap">
            <input
              id="password"
              class="input"
              [type]="showPw() ? 'text' : 'password'"
              autocomplete="current-password"
              formControlName="password"
              [class.invalid]="showErr('password')"
            />
            <button
              type="button"
              (click)="showPw.set(!showPw())"
              [attr.aria-label]="showPw() ? 'Hide password' : 'Show password'"
            >
              <i class="ms" aria-hidden="true">{{ showPw() ? 'visibility_off' : 'visibility' }}</i>
            </button>
          </div>
        </div>
        <button type="submit" class="btn btn-primary lg block" [disabled]="busy()">
          @if (busy()) {
            <span class="spinner" aria-hidden="true"></span>Signing in…
          } @else {
            Log in
          }
        </button>
      </form>
      <p class="switch">New here? <a routerLink="/register">Create an account</a></p>
    </sb-auth-layout>
  `,
})
export class LoginPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly returnUrl = input<string | undefined>();

  readonly form = inject(NonNullableFormBuilder).group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly showPw = signal(false);
  private submitted = signal(false);

  showErr(name: 'email' | 'password') {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async submit() {
    this.submitted.set(true);
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const user = await this.auth.login(this.form.getRawValue());
      await this.router.navigateByUrl(user.onboarded ? safeReturnUrl(this.returnUrl()) : '/onboarding');
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
