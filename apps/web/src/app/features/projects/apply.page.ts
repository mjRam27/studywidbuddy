import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import {
  CV_MAX_BYTES,
  CV_PASS_SCORE,
  cvRequiredFor,
  ErrorCode,
  type Profile,
  type ProjectDetail,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { levelLabel } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { TopbarComponent } from '../../layout/topbar.component';
import { AvatarComponent } from '../../ui/avatar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';

/** Application form (new screen). Reuses the profile instead of asking for it again. */
@Component({
  selector: 'sb-apply-page',
  imports: [RouterLink, ReactiveFormsModule, TopbarComponent, AvatarComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/projects">Projects</a><i class="ms" aria-hidden="true">chevron_right</i>
        <a [routerLink]="['/projects', slug()]" class="ellipsis">{{ project()?.title ?? 'Project' }}</a
        ><i class="ms" aria-hidden="true">chevron_right</i>
        <b>Apply</b>
      </nav>
    </sb-topbar>
    <div class="page narrow" style="max-width:960px">
      @if (loadError()) {
        <sb-error-state [error]="loadError()" (retry)="load()" />
      } @else if (!project() || !profile()) {
        <sb-skeleton [rows]="8" [height]="20" />
      } @else {
        @let p = project()!;
        <div class="page-head-text">
          <span class="eyebrow">STEP 1 OF 4 · APPLY</span>
          <h1>Apply to {{ p.title }}</h1>
          @if (cvNeeded()) {
            <span class="subline"
              >Upload your CV: our AI screens it against the role. A score of {{ passScore }}+ unlocks a short voice
              interview you can take right away or book within 5 days.</span
            >
          } @else {
            <span class="subline"
              >Entry-level project: no CV screening. Apply and go straight to a short voice interview, right away or
              within 5 days.</span
            >
          }
        </div>

        <form class="form-stack" [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (error(); as e) {
            <div class="banner danger" role="alert">
              <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
            </div>
          }

          <section class="panel pad-lg">
            <span class="panel-title" id="role-h">Which role?</span>
            <div
              style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px"
              role="radiogroup"
              aria-labelledby="role-h"
            >
              @for (r of p.roles; track r.id) {
                <button
                  type="button"
                  role="radio"
                  class="role-card pick"
                  [class.on]="form.controls.roleId.value === r.id"
                  [attr.aria-checked]="form.controls.roleId.value === r.id"
                  [disabled]="r.open === 0"
                  (click)="form.controls.roleId.setValue(r.id)"
                >
                  <div class="head">
                    <span class="radio" [class.on]="form.controls.roleId.value === r.id" aria-hidden="true"></span
                    ><span class="title grow">{{ r.title }}</span>
                  </div>
                  <span class="desc">{{ r.description }}</span>
                  <span class="faint sm">{{ r.open === 0 ? 'Full' : r.open + ' of ' + r.seats + ' open' }}</span>
                </button>
              }
            </div>
            @if (submitted() && form.controls.roleId.invalid) {
              <span class="field-error"
                ><i class="ms" aria-hidden="true">error</i>Pick the role you want to interview for.</span
              >
            }
          </section>

          <section class="panel pad-lg" aria-labelledby="cv-h">
            <span class="panel-title" id="cv-h"
              >Your CV
              @if (!cvNeeded()) {
                <span class="opt">optional</span>
              }</span
            >
            <label
              class="cv-drop"
              [class.has]="!!cv()"
              [class.invalid]="submitted() && cvNeeded() && !cv()"
              for="cv-file"
            >
              <i class="ms" aria-hidden="true">{{ cv() ? 'description' : 'upload_file' }}</i>
              <span style="display:flex;flex-direction:column;gap:2px;min-width:0">
                @if (cv(); as f) {
                  <span class="ellipsis" style="font-weight:600">{{ f.name }}</span>
                  <span class="faint sm">{{ kb(f.size) }} · click to choose another file</span>
                } @else {
                  <span style="font-weight:600">Choose your CV (PDF, up to 5 MB)</span>
                  <span class="faint sm">{{
                    cvNeeded()
                      ? 'Scored by an AI applicant-tracking check against this role’s skills.'
                      : 'Not scored on entry-level projects. Add one if you have it; your team can see it.'
                  }}</span>
                }
              </span>
              <input id="cv-file" class="sr-only" type="file" accept="application/pdf,.pdf" (change)="pick($event)" />
            </label>
            @if (cvError(); as e) {
              <span class="field-error"><i class="ms" aria-hidden="true">error</i>{{ e }}</span>
            } @else if (submitted() && cvNeeded() && !cv()) {
              <span class="field-error"><i class="ms" aria-hidden="true">error</i>Attach your CV to apply.</span>
            }
          </section>

          <section class="panel pad-lg">
            <span class="panel-title">About you</span>
            <div class="field">
              <label for="motivation">Why this project and role?</label>
              <textarea
                id="motivation"
                class="textarea"
                rows="5"
                formControlName="motivation"
                [class.invalid]="showErr('motivation')"
                placeholder="What do you want to learn or prove, and what will you bring to the team?"
              ></textarea>
              <span [class]="showErr('motivation') ? 'field-error' : 'field-hint'">
                @if (showErr('motivation')) {
                  <i class="ms" aria-hidden="true">error</i>
                }
                At least 40 characters · {{ form.controls.motivation.value.length }} / 2000
              </span>
            </div>
            <div class="form-row">
              <div class="field">
                <label for="hours">Hours per week you can commit</label>
                <input
                  id="hours"
                  class="input"
                  type="number"
                  min="1"
                  max="60"
                  formControlName="availabilityHoursPerWeek"
                  [class.invalid]="showErr('availabilityHoursPerWeek')"
                />
                @if (showErr('availabilityHoursPerWeek')) {
                  <span class="field-error"><i class="ms" aria-hidden="true">error</i>Between 1 and 60 hours.</span>
                } @else {
                  <span class="field-hint">Most teams expect 8–15 hours.</span>
                }
              </div>
            </div>
            <div class="field">
              <label for="experience">Relevant experience <span class="opt">optional</span></label>
              <textarea
                id="experience"
                class="textarea"
                rows="3"
                formControlName="relevantExperience"
                placeholder="Courses, projects, jobs or side projects that relate to this role."
              ></textarea>
            </div>
          </section>

          <section class="panel pad-lg">
            <div class="panel-head">
              <span class="panel-title">From your profile</span>
              <a routerLink="/settings" class="link-strong" style="margin-left:auto;font-size:12.5px">Edit profile</a>
            </div>
            @let me = profile()!;
            <div style="display:flex;gap:12px;align-items:center">
              <sb-avatar [name]="me.displayName" [src]="me.avatarUrl" [self]="true" [size]="40" />
              <div style="display:flex;flex-direction:column">
                <span style="font-weight:600">{{ me.displayName }}</span>
                <span class="faint sm">{{ me.headline || 'No headline yet' }}</span>
              </div>
            </div>
            <div class="chips">
              @for (s of me.skills; track s.skillId + s.source) {
                <span class="chip" [class.match]="s.source === 'DEMONSTRATED'">
                  @if (s.source === 'DEMONSTRATED') {
                    <i class="ms" aria-hidden="true">verified</i>
                  }
                  {{ s.name }} · {{ levelLabel(s.level) }}
                </span>
              } @empty {
                <span class="faint sm"
                  >No skills on your profile. Adding them helps the interview fit your background.</span
                >
              }
            </div>
          </section>

          <div style="display:flex;gap:8px;justify-content:flex-end">
            <a class="btn btn-secondary lg" [routerLink]="['/projects', p.slug]">Cancel</a>
            <button type="submit" class="btn btn-primary lg" [disabled]="busy()">
              @if (busy()) {
                <span class="spinner" aria-hidden="true"></span>Submitting…
              } @else {
                Submit application
              }
            </button>
          </div>
        </form>
      }
    </div>
  `,
})
export class ApplyPage {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string>();
  readonly project = signal<ProjectDetail | null>(null);
  readonly profile = signal<Profile | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly error = signal<string | null>(null);
  readonly busy = signal(false);
  readonly submitted = signal(false);
  readonly levelLabel = levelLabel;
  readonly passScore = CV_PASS_SCORE;
  readonly cv = signal<File | null>(null);
  readonly cvError = signal<string | null>(null);
  /** Entry-level projects skip CV matching. */
  readonly cvNeeded = computed(() => cvRequiredFor(this.project()?.difficulty ?? 'INTERMEDIATE'));

  readonly form = inject(NonNullableFormBuilder).group({
    roleId: ['', Validators.required],
    motivation: ['', [Validators.required, Validators.minLength(40), Validators.maxLength(2000)]],
    availabilityHoursPerWeek: [10, [Validators.required, Validators.min(1), Validators.max(60)]],
    relevantExperience: ['', Validators.maxLength(2000)],
  });

  constructor() {
    effect(() => {
      this.slug();
      untracked(() => void this.load());
    });
  }

  pick(e: Event) {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    this.cvError.set(null);
    if (!f) return;
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') {
      this.cvError.set('Upload your CV as a PDF.');
      return;
    }
    if (f.size > CV_MAX_BYTES) {
      this.cvError.set('Your CV must be 5 MB or smaller.');
      return;
    }
    this.cv.set(f);
  }

  kb(n: number) {
    return n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
  }

  showErr(name: 'motivation' | 'availabilityHoursPerWeek') {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  async load() {
    this.loadError.set(null);
    try {
      const [p, me] = await Promise.all([this.api.project(this.slug()), this.api.myProfile()]);
      if (p.myApplication) {
        await this.router.navigate(['/applications', p.myApplication.id], { replaceUrl: true });
        return;
      }
      this.project.set(p);
      this.profile.set(me);
      const firstOpen = p.roles.find((r) => r.open > 0);
      if (firstOpen && !this.form.controls.roleId.value) this.form.controls.roleId.setValue(firstOpen.id);
    } catch (e) {
      this.loadError.set(toApiError(e));
    }
  }

  async submit() {
    this.submitted.set(true);
    if (this.form.invalid || !this.project() || (this.cvNeeded() && !this.cv())) return;
    this.busy.set(true);
    this.error.set(null);
    const v = this.form.getRawValue();
    try {
      const app = await this.api.apply(
        this.project()!.id,
        {
          roleId: v.roleId,
          motivation: v.motivation.trim(),
          availabilityHoursPerWeek: Number(v.availabilityHoursPerWeek),
          relevantExperience: v.relevantExperience.trim() || undefined,
        },
        this.cv(),
      );
      this.toast.ok(
        this.cvNeeded() ? 'Application submitted. Your CV is being screened.' : 'Application submitted. Book your voice interview.',
      );
      await this.router.navigate(['/applications', app.id]);
    } catch (e) {
      const err = toApiError(e);
      this.error.set(
        err.code === ErrorCode.VALIDATION_FAILED && err.fieldMessages.length
          ? err.fieldMessages.join(' ')
          : err.message,
      );
    } finally {
      this.busy.set(false);
    }
  }
}
