import { ChangeDetectionStrategy, Component, inject, type OnInit, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Visibility, type Profile } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { GithubConnectComponent } from './github-connect.component';
import { SkillsEditorComponent } from './skills-editor.component';

const VISIBILITY: { v: Visibility; icon: string; label: string; help: string }[] = [
  {
    v: Visibility.PUBLIC,
    icon: 'public',
    label: 'Public',
    help: 'Anyone signed in to StudywidBuddy can see your profile.',
  },
  {
    v: Visibility.CONNECTIONS,
    icon: 'group',
    label: 'Connections',
    help: 'Only people you’re connected with. Until connections launch, that means only you.',
  },
  { v: Visibility.PRIVATE, icon: 'lock', label: 'Private', help: 'Only you.' },
];

@Component({
  selector: 'sb-settings-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    TopbarComponent,
    SkillsEditorComponent,
    GithubConnectComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar><span class="topbar-title">Settings</span></sb-topbar>
    <div class="page narrow">
      <div class="settings-layout">
        <nav class="settings-nav" aria-label="Settings sections">
          <a class="nav-item" href="#profile">Profile</a>
          <a class="nav-item" href="#skills">Skills</a>
          <a class="nav-item" href="#visibility">Privacy & visibility</a>
          <a class="nav-item" href="#github">Connected accounts</a>
          <a class="nav-item" href="#account">Account</a>
        </nav>
        <div style="display:flex;flex-direction:column;gap:16px;min-width:0">
          @if (loadError()) {
            <sb-error-state [error]="loadError()" (retry)="load()" />
          } @else if (!profile()) {
            <sb-skeleton [rows]="8" [height]="20" />
          } @else {
            <section class="panel pad-lg" id="profile" aria-labelledby="profile-h">
              <div class="panel-head">
                <span class="panel-title" id="profile-h">Profile</span>
                <a
                  class="link-strong"
                  [routerLink]="['/u', profile()!.username]"
                  style="margin-left:auto;font-size:12.5px"
                  >View profile</a
                >
              </div>
              <form class="form-stack" [formGroup]="form" (ngSubmit)="save()" novalidate>
                <div class="form-row">
                  <div class="field">
                    <label for="displayName">Name</label>
                    <input id="displayName" class="input" formControlName="displayName" autocomplete="name" />
                  </div>
                  <div class="field">
                    <label for="location">Location <span class="opt">optional</span></label>
                    <input id="location" class="input" formControlName="location" placeholder="City, country" />
                  </div>
                </div>
                <div class="field">
                  <label for="headline">Headline <span class="opt">optional</span></label>
                  <input
                    id="headline"
                    class="input"
                    formControlName="headline"
                    maxlength="120"
                    placeholder="e.g. Backend developer learning frontend"
                  />
                </div>
                <div class="field">
                  <label for="bio">Bio <span class="opt">optional</span></label>
                  <textarea id="bio" class="textarea" rows="4" formControlName="bio" maxlength="2000"></textarea>
                </div>
                <div class="form-row">
                  <div class="field">
                    <label for="timezone">Timezone</label>
                    <select id="timezone" class="select" formControlName="timezone">
                      @for (z of timezones; track z) {
                        <option [value]="z">{{ z }}</option>
                      }
                    </select>
                  </div>
                  <div class="field">
                    <label for="languages">Languages</label>
                    <input id="languages" class="input" formControlName="languages" placeholder="English, German" />
                    <span class="field-hint">Separate with commas.</span>
                  </div>
                </div>
                @if (saveError(); as e) {
                  <div class="banner danger" role="alert">
                    <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
                  </div>
                }
                <div style="display:flex;justify-content:flex-end">
                  <button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine || form.invalid">
                    @if (saving()) {
                      <span class="spinner" aria-hidden="true"></span>Saving…
                    } @else {
                      Save profile
                    }
                  </button>
                </div>
              </form>
            </section>

            <section class="panel pad-lg" id="skills" aria-labelledby="skills-h">
              <span class="panel-title" id="skills-h">Skills</span>
              <span class="faint sm" style="margin-top:-6px"
                >Self-reported skills help matching. Proven ones come from courses and projects you finish.</span
              >
              <sb-skills-editor />
            </section>

            <section class="panel pad-lg" id="visibility" aria-labelledby="vis-h">
              <span class="panel-title" id="vis-h">Who can see your profile</span>
              <div class="level-choice" role="radiogroup" aria-labelledby="vis-h">
                @for (o of visibility; track o.v) {
                  <button
                    type="button"
                    role="radio"
                    [class.on]="profile()!.visibility === o.v"
                    [attr.aria-checked]="profile()!.visibility === o.v"
                    [disabled]="saving()"
                    (click)="setVisibility(o.v)"
                  >
                    <span class="radio" [class.on]="profile()!.visibility === o.v" aria-hidden="true"></span>
                    <i class="ms" aria-hidden="true" style="color:var(--ink-2)">{{ o.icon }}</i>
                    <span style="display:flex;flex-direction:column"
                      ><span class="t">{{ o.label }}</span
                      ><span class="s">{{ o.help }}</span></span
                    >
                  </button>
                }
              </div>
            </section>

            <sb-github-connect />

            <section class="panel pad-lg" id="account" aria-labelledby="acct-h">
              <span class="panel-title" id="acct-h">Account</span>
              @if (auth.user(); as u) {
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
                  <span style="font-weight:500">{{ u.email }}</span>
                  @if (u.emailVerified) {
                    <span class="status ok"><i class="ms" aria-hidden="true">verified</i>Confirmed</span>
                  } @else {
                    <span class="status warn"><i class="ms" aria-hidden="true">mark_email_unread</i>Not confirmed</span>
                    <button type="button" class="btn btn-secondary xs" [disabled]="resending()" (click)="resend()">
                      Resend confirmation
                    </button>
                  }
                </div>
              }
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                <a class="btn btn-secondary" routerLink="/forgot-password">Change password</a>
                <button type="button" class="btn btn-ghost" (click)="auth.logout()">
                  <i class="ms" aria-hidden="true">logout</i>Sign out
                </button>
              </div>
            </section>
          }
        </div>
      </div>
    </div>
  `,
})
export class SettingsPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly toast = inject(ToastService);

  readonly visibility = VISIBILITY;
  readonly timezones: string[] = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf?.('timeZone') ?? ['UTC'];
  readonly profile = signal<Profile | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly saving = signal(false);
  readonly resending = signal(false);

  readonly form = inject(NonNullableFormBuilder).group({
    displayName: ['', [Validators.required, Validators.maxLength(80)]],
    headline: ['', Validators.maxLength(120)],
    bio: ['', Validators.maxLength(2000)],
    location: ['', Validators.maxLength(80)],
    timezone: ['UTC'],
    languages: [''],
  });

  ngOnInit() {
    void this.load();
  }

  async load() {
    this.loadError.set(null);
    try {
      const p = await this.api.myProfile();
      this.profile.set(p);
      if (p.timezone && !this.timezones.includes(p.timezone)) this.timezones.unshift(p.timezone);
      this.form.reset({
        displayName: p.displayName,
        headline: p.headline ?? '',
        bio: p.bio ?? '',
        location: p.location ?? '',
        timezone: p.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
        languages: p.languages.join(', '),
      });
    } catch (e) {
      this.loadError.set(toApiError(e));
    }
  }

  async save() {
    if (this.form.invalid) return;
    const v = this.form.getRawValue();
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const p = await this.api.updateProfile({
        displayName: v.displayName.trim(),
        headline: v.headline.trim() || null,
        bio: v.bio.trim() || null,
        location: v.location.trim() || null,
        timezone: v.timezone,
        languages: v.languages
          .split(',')
          .map((l) => l.trim())
          .filter(Boolean),
      });
      this.profile.set(p);
      this.auth.patchUser({ displayName: p.displayName });
      this.form.markAsPristine();
      this.toast.ok('Profile saved.');
    } catch (e) {
      const err = toApiError(e);
      this.saveError.set(err.fieldMessages.length ? err.fieldMessages.join(' ') : err.message);
    } finally {
      this.saving.set(false);
    }
  }

  async setVisibility(v: Visibility) {
    this.saving.set(true);
    try {
      this.profile.set(await this.api.updateProfile({ visibility: v }));
      this.toast.ok('Visibility updated.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.saving.set(false);
    }
  }

  async resend() {
    this.resending.set(true);
    try {
      await this.api.resendVerification();
      this.toast.ok('We sent you a new confirmation link.');
    } catch (e) {
      this.toast.error(toApiError(e).message);
    } finally {
      this.resending.set(false);
    }
  }
}
