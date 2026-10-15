import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ErrorCode } from '@studywidbuddy/shared';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { AuthLayoutComponent } from './auth-layout.component';

const USERNAME = /^[a-z0-9](?:[a-z0-9._-]{1,28})[a-z0-9]$/;

@Component({
  selector: 'sb-register-page',
  imports: [ReactiveFormsModule, RouterLink, AuthLayoutComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-auth-layout alt="login">
      <div>
        <h2>Create your account</h2>
        <p class="lead">Free to start. Up to four courses at once, each with a Study Buddy.</p>
      </div>
      <form class="form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        @if (error(); as e) {
          <div class="banner danger" role="alert">
            <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
          </div>
        }
        <div class="field">
          <label for="displayName">Your name</label>
          <input
            id="displayName"
            class="input"
            autocomplete="name"
            formControlName="displayName"
            [class.invalid]="showErr('displayName')"
          />
          @if (showErr('displayName')) {
            <span class="field-error"><i class="ms" aria-hidden="true">error</i>Tell us what to call you.</span>
          }
        </div>
        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            class="input"
            autocomplete="username"
            formControlName="username"
            [class.invalid]="showErr('username') || !!usernameTaken()"
            (input)="usernameTaken.set(null)"
          />
          @if (usernameTaken(); as m) {
            <span class="field-error"><i class="ms" aria-hidden="true">error</i>{{ m }}</span>
          } @else if (showErr('username')) {
            <span class="field-error"
              ><i class="ms" aria-hidden="true">error</i>Use 3–30 lowercase letters, numbers, dots, dashes or
              underscores.</span
            >
          } @else {
            <span class="field-hint">Your profile will be at /u/{{ form.controls.username.value || 'username' }}</span>
          }
        </div>
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
          <label for="password">Password</label>
          <div class="pw-wrap">
            <input
              id="password"
              class="input"
              [type]="showPw() ? 'text' : 'password'"
              autocomplete="new-password"
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
          @if (showErr('password')) {
            <span class="field-error"><i class="ms" aria-hidden="true">error</i>Use at least 10 characters.</span>
          } @else {
            <span class="field-hint">At least 10 characters. A short sentence works well.</span>
          }
        </div>
        <button type="submit" class="btn btn-primary lg block" [disabled]="busy()">
          @if (busy()) {
            <span class="spinner" aria-hidden="true"></span>Creating account…
          } @else {
            Create account
          }
        </button>
      </form>
      <p class="switch">Already have an account? <a routerLink="/login">Log in</a></p>
    </sb-auth-layout>
  `,
})
export class RegisterPage {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    username: ['', [Validators.required, Validators.pattern(USERNAME)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(128)]],
  });
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly usernameTaken = signal<string | null>(null);
  readonly showPw = signal(false);
  private readonly submitted = signal(false);

  showErr(name: keyof typeof this.form.controls) {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async submit() {
    this.submitted.set(true);
    const raw = this.form.getRawValue();
    this.form.controls.username.setValue(raw.username.trim().toLowerCase());
    if (this.form.invalid) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.auth.register(this.form.getRawValue());
      await this.router.navigateByUrl('/onboarding');
    } catch (e) {
      const err = toApiError(e);
      if (err.code === ErrorCode.USERNAME_TAKEN) this.usernameTaken.set(err.message);
      else this.error.set(err.message);
    } finally {
      this.busy.set(false);
    }
  }
}
