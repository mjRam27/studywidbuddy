import { ChangeDetectionStrategy, Component, computed, inject, type OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ErrorCode, SkillLevel, type CourseSummary, type ProfileSkill, type Skill } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { toApiError } from '../../core/api-error';
import { AuthService } from '../../core/auth.service';
import { levelLabel } from '../../core/format';
import { ToastService } from '../../core/toast.service';
import { BrandComponent } from '../../ui/brand.component';
import { LevelBadgeComponent } from '../../ui/level-badge.component';

type Step = 'basics' | 'skills' | 'course';
const STEPS: Step[] = ['basics', 'skills', 'course'];
const LEVELS: SkillLevel[] = [SkillLevel.BEGINNER, SkillLevel.INTERMEDIATE, SkillLevel.ADVANCED];
const COMMON_LANGUAGES = [
  'English',
  'German',
  'Spanish',
  'French',
  'Hindi',
  'Mandarin',
  'Japanese',
  'Italian',
  'Portuguese',
  'Arabic',
];

/**
 * First-run setup. Each step saves through the API as you go, so leaving halfway keeps
 * what you entered. Goals and availability for matching arrive with Study Buddies.
 */
@Component({
  selector: 'sb-onboarding-page',
  imports: [FormsModule, BrandComponent, LevelBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <header class="public-header">
        <div class="public-header-inner">
          <sb-brand link="/onboarding" />
          <div class="public-header-end">
            <button type="button" class="btn btn-ghost" (click)="auth.logout()">Sign out</button>
          </div>
        </div>
      </header>
      <div class="onboard">
        <div
          class="onboard-steps"
          role="progressbar"
          [attr.aria-valuenow]="index() + 1"
          aria-valuemin="1"
          [attr.aria-valuemax]="steps.length"
        >
          @for (s of steps; track s) {
            <span [class.on]="$index <= index()"></span>
          }
        </div>
        <span class="eyebrow">STEP {{ index() + 1 }} OF {{ steps.length }}</span>

        @if (error(); as e) {
          <div class="banner danger" role="alert">
            <i class="ms" aria-hidden="true">error</i><span>{{ e }}</span>
          </div>
        }

        @switch (step()) {
          @case ('basics') {
            <h1>Hi {{ firstName() }}. Tell people a little about you.</h1>
            <p class="subline">This helps us match you with Study Buddies who share a language and timezone.</p>
            <div class="form-stack">
              <div class="field">
                <label for="headline">Headline <span class="opt">optional</span></label>
                <input
                  id="headline"
                  class="input"
                  maxlength="120"
                  placeholder="e.g. Backend developer learning frontend"
                  [(ngModel)]="headline"
                />
              </div>
              <div class="field">
                <label for="tz">Timezone</label>
                <select id="tz" class="select" [(ngModel)]="timezone">
                  @for (z of timezones; track z) {
                    <option [value]="z">{{ z }}</option>
                  }
                </select>
              </div>
              <div class="field">
                <span class="field-label">Languages you can study in</span>
                <div class="chips" role="group" aria-label="Languages">
                  @for (l of languageOptions; track l) {
                    <button
                      type="button"
                      class="choice-chip"
                      [class.on]="languages().includes(l)"
                      [attr.aria-pressed]="languages().includes(l)"
                      (click)="toggleLanguage(l)"
                    >
                      @if (languages().includes(l)) {
                        <i class="ms" aria-hidden="true" style="font-size:16px">check</i>
                      }
                      {{ l }}
                    </button>
                  }
                </div>
              </div>
            </div>
          }
          @case ('skills') {
            <h1>What do you already know?</h1>
            <p class="subline">
              Honest, not a test. Skills you add here show as self-reported until a course or project proves them.
            </p>
            <div class="field">
              <label for="skill-q">Search skills</label>
              <div class="search-box" style="width:100%;height:38px;background:var(--surface)">
                <i class="ms" aria-hidden="true">search</i>
                <input
                  id="skill-q"
                  placeholder="TypeScript, Python, Docker…"
                  [ngModel]="skillQuery()"
                  (ngModelChange)="searchSkills($event)"
                  autocomplete="off"
                />
              </div>
            </div>
            @if (skillResults().length) {
              <div class="chips">
                @for (s of skillResults(); track s.id) {
                  @if (!hasSkill(s.id)) {
                    <button type="button" class="choice-chip" (click)="addSkill(s)">
                      <i class="ms" aria-hidden="true" style="font-size:16px">add</i>{{ s.name }}
                    </button>
                  }
                }
              </div>
            }
            <div class="panel" style="gap:0;padding:6px 16px">
              @for (s of mySkills(); track s.skillId) {
                <div
                  style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--line-soft)"
                >
                  <span class="grow" style="font-weight:500">{{ s.name }}</span>
                  <div class="segmented" role="radiogroup" [attr.aria-label]="s.name + ' level'">
                    @for (l of levels; track l) {
                      <button
                        type="button"
                        role="radio"
                        [attr.aria-checked]="s.level === l"
                        [class.on]="s.level === l"
                        (click)="setLevel(s.skillId, l)"
                      >
                        {{ levelLabel(l) }}
                      </button>
                    }
                  </div>
                  <button
                    type="button"
                    class="icon-btn sm"
                    [attr.aria-label]="'Remove ' + s.name"
                    (click)="removeSkill(s.skillId)"
                  >
                    <i class="ms" aria-hidden="true">close</i>
                  </button>
                </div>
              } @empty {
                <p class="faint sm" style="padding:12px 0">No skills yet. Search above, or skip this step.</p>
              }
            </div>
          }
          @case ('course') {
            <h1>What do you want to learn first?</h1>
            <p class="subline">Pick one to start. You can have up to four running at the same time.</p>
            <div class="choice-grid">
              @for (c of courses(); track c.id) {
                <button
                  type="button"
                  class="choice"
                  [class.on]="courseId() === c.id"
                  [attr.aria-pressed]="courseId() === c.id"
                  (click)="courseId.set(c.id); courseLevel.set(c.level)"
                >
                  <span class="t">{{ c.title }}</span>
                  <span class="s">{{ c.summary }}</span>
                  <span style="margin-top:6px"><sb-level-badge [level]="c.level" /></span>
                </button>
              }
            </div>
            @if (courseId()) {
              <div class="field">
                <span class="field-label">Your current level in this</span>
                <div class="chips" role="radiogroup" aria-label="Your level">
                  @for (l of levels; track l) {
                    <button
                      type="button"
                      role="radio"
                      class="choice-chip"
                      [class.on]="courseLevel() === l"
                      [attr.aria-checked]="courseLevel() === l"
                      (click)="courseLevel.set(l)"
                    >
                      {{ levelLabel(l) }}
                    </button>
                  }
                </div>
                <span class="field-hint">We use this to match you with a partner, not to grade you.</span>
              </div>
            }
          }
        }

        <div class="onboard-foot">
          @if (index() > 0) {
            <button type="button" class="btn btn-ghost" (click)="back()">
              <i class="ms" aria-hidden="true">arrow_back</i>Back
            </button>
          }
          <span class="grow"></span>
          @if (step() === 'course') {
            <button type="button" class="btn btn-secondary" [disabled]="busy()" (click)="finish(false)">
              Skip for now
            </button>
            <button type="button" class="btn btn-primary" [disabled]="busy() || !courseId()" (click)="finish(true)">
              @if (busy()) {
                <span class="spinner" aria-hidden="true"></span>
              }
              Start learning
            </button>
          } @else {
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="next()">
              @if (busy()) {
                <span class="spinner" aria-hidden="true"></span>
              }
              Continue<i class="ms" aria-hidden="true">arrow_forward</i>
            </button>
          }
        </div>
      </div>
    </div>
  `,
})
export class OnboardingPage implements OnInit {
  readonly auth = inject(AuthService);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);

  readonly steps = STEPS;
  readonly levels = LEVELS;
  readonly levelLabel = levelLabel;
  readonly languageOptions = COMMON_LANGUAGES;
  readonly timezones: string[] = (
    Intl as unknown as { supportedValuesOf?: (k: string) => string[] }
  ).supportedValuesOf?.('timeZone') ?? ['UTC'];

  readonly index = signal(0);
  readonly step = computed(() => STEPS[this.index()]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly firstName = computed(() => this.auth.user()?.displayName.split(' ')[0] ?? 'there');

  headline = '';
  timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  readonly languages = signal<string[]>(['English']);

  readonly skillQuery = signal('');
  readonly skillResults = signal<Skill[]>([]);
  readonly mySkills = signal<ProfileSkill[]>([]);
  private searchTimer: ReturnType<typeof setTimeout> | undefined;

  readonly courses = signal<CourseSummary[]>([]);
  readonly courseId = signal<string | null>(null);
  readonly courseLevel = signal<SkillLevel>(SkillLevel.BEGINNER);

  async ngOnInit() {
    try {
      const [profile, courses] = await Promise.all([this.api.myProfile(), this.api.courses()]);
      this.headline = profile.headline ?? '';
      if (profile.timezone) this.timezone = profile.timezone;
      if (profile.languages.length) this.languages.set(profile.languages);
      this.mySkills.set(profile.skills.filter((s) => s.source === 'CLAIMED'));
      this.courses.set(courses);
      if (!this.timezones.includes(this.timezone)) this.timezones.unshift(this.timezone);
      void this.searchSkills('');
    } catch (e) {
      this.error.set(toApiError(e).message);
    }
  }

  toggleLanguage(l: string) {
    this.languages.update((ls) => (ls.includes(l) ? ls.filter((x) => x !== l) : [...ls, l]));
  }

  searchSkills(q: string) {
    this.skillQuery.set(q);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(async () => {
      try {
        this.skillResults.set(await this.api.searchSkills(q, 12));
      } catch {
        /* search is a convenience; failures leave the last results */
      }
    }, 200);
  }

  hasSkill(id: string) {
    return this.mySkills().some((s) => s.skillId === id);
  }

  async addSkill(s: Skill) {
    await this.saveSkills(() => this.api.setSkill(s.id, SkillLevel.BEGINNER));
  }

  async setLevel(skillId: string, level: SkillLevel) {
    await this.saveSkills(() => this.api.setSkill(skillId, level));
  }

  async removeSkill(skillId: string) {
    await this.saveSkills(() => this.api.removeSkill(skillId));
  }

  private async saveSkills(op: () => Promise<ProfileSkill[]>) {
    try {
      this.mySkills.set((await op()).filter((s) => s.source === 'CLAIMED'));
    } catch (e) {
      this.toast.error(toApiError(e).message);
    }
  }

  back() {
    this.index.update((i) => Math.max(0, i - 1));
  }

  async next() {
    this.error.set(null);
    if (this.step() === 'basics') {
      this.busy.set(true);
      try {
        await this.api.updateProfile({
          headline: this.headline || null,
          timezone: this.timezone,
          languages: this.languages(),
        });
      } catch (e) {
        this.error.set(toApiError(e).message);
        return;
      } finally {
        this.busy.set(false);
      }
    }
    this.index.update((i) => i + 1);
  }

  async finish(enroll: boolean) {
    this.busy.set(true);
    this.error.set(null);
    try {
      if (enroll && this.courseId()) {
        // Coming back to this step after enrolling once is fine; anything else is a real error.
        await this.api.enroll(this.courseId()!, this.courseLevel()).catch((e) => {
          if (toApiError(e).code !== ErrorCode.ALREADY_ENROLLED) throw e;
        });
      }
      await this.api.completeOnboarding();
      this.auth.patchUser({ onboarded: true });
      await this.router.navigateByUrl(enroll ? '/learn' : '/home');
    } catch (e) {
      this.error.set(toApiError(e).message);
    } finally {
      this.busy.set(false);
    }
  }
}
