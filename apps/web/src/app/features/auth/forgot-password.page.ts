import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'sb-forgot-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-auth-layout headline="It happens." alt="login">
      @if (sentTo(); as email) {
        <div class="result-icon info" aria-hidden="true"><i class="ms">mark_email_read</i></div>
        <div>
          <h2>Check your inbox</h2>
          <p class="lead">
            If an account exists for <b>{{ email }}</b
            >, we’ve sent a link to reset your password. It works for one hour.
          </p>
        </div>
        <a class="btn btn-secondary lg block" routerLink="/login">Back to log in</a>
      } @else {
        <div>
          <h2>Reset your password</h2>
          <p class="lead">Enter the email you signed up with and we’ll send you a reset link.</p>
        </div>
        <form class="form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <div class="banner danger" role="alert">
              <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
            </div>
          }
          <div class="field">
            <label for="email">Email</label>
            <input id="email" class="input" type="email" autocomplete="email" formControlName="email" />
          </div>
          <button type="submit" class="btn btn-primary lg block" [disabled]="busy() || form.invalid">
            @if (busy()) {
              <span class="spinner" aria-hidden="true"></span>Sending…
            } @else {
              Send reset link
            }
          </button>
        </form>
        <p class="switch"><a routerLink="/login">Back to log in</a></p>
      }
    </sb-auth-layout>
  `,
})
export class ForgotPasswordPage {
  private readonly api = inject(Api);
  readonly form = inject(NonNullableFormBuilder).group({ email: ['', [Validators.required, Validators.email]] });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentTo = signal<string | null>(null);

  async submit() {
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const { email } = this.form.getRawValue();
      await this.api.forgotPassword(email);
      this.sentTo.set(email);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
