import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthLayoutComponent } from './auth-layout.component';

@Component({
  selector: 'sb-reset-password-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-auth-layout headline="Fresh start." alt="login">
      @if (!token()) {
        <div class="result-icon bad" aria-hidden="true"><i class="ms">link_off</i></div>
        <div>
          <h2>This link is incomplete</h2>
          <p class="lead">Open the link from your email again, or request a new one.</p>
        </div>
        <a class="btn btn-primary lg block" routerLink="/forgot-password">Request a new link</a>
      } @else if (done()) {
        <div class="result-icon ok" aria-hidden="true"><i class="ms">check_circle</i></div>
        <div>
          <h2>Password updated</h2>
          <p class="lead">You’ve been signed out everywhere else. Log in with your new password.</p>
        </div>
        <a class="btn btn-primary lg block" routerLink="/login">Log in</a>
      } @else {
        <div>
          <h2>Choose a new password</h2>
          <p class="lead">At least 10 characters. Every other session will be signed out.</p>
        </div>
        <form class="form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <div class="banner danger" role="alert">
              <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
              <a class="actions" routerLink="/forgot-password">New link</a>
            </div>
          }
          <div class="field">
            <label for="password">New password</label>
            <input id="password" class="input" type="password" autocomplete="new-password" formControlName="password" />
          </div>
          <div class="field">
            <label for="confirm">Repeat it</label>
            <input
              id="confirm"
              class="input"
              type="password"
              autocomplete="new-password"
              formControlName="confirm"
              [class.invalid]="mismatch()"
            />
            @if (mismatch()) {
              <span class="field-error"><i class="ms" aria-hidden="true">error</i>The passwords don’t match.</span>
            }
          </div>
          <button type="submit" class="btn btn-primary lg block" [disabled]="busy() || form.invalid">
            @if (busy()) {
              <span class="spinner" aria-hidden="true"></span>Saving…
            } @else {
              Save password
            }
          </button>
        </form>
      }
    </sb-auth-layout>
  `,
})
export class ResetPasswordPage {
  private readonly api = inject(Api);
  readonly token = input<string | undefined>();
  readonly form = inject(NonNullableFormBuilder).group({
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
    confirm: ['', Validators.required],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);
  readonly mismatch = signal(false);

  async submit() {
    const { password, confirm } = this.form.getRawValue();
    this.mismatch.set(password !== confirm);
    if (this.form.invalid || this.mismatch() || !this.token()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.resetPassword(this.token()!, password);
      this.done.set(true);
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
