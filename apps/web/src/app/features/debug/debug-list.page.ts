import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  BUG_CATEGORIES,
  BUG_CATEGORY_LABEL,
  type BugCategory,
  DEBUG_LANGUAGE_LABEL,
  DEBUG_LANGUAGES,
  DEBUG_LEVEL_LABEL,
  DEBUG_LEVELS,
  type DebugExerciseSummary,
  type DebugLanguage,
  type DebugLevel,
  type DebugStatus,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import { TopbarComponent } from '../../layout/topbar.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { LEVEL_CLASS, progressFor, STATUS_VIEW } from './debug-format';

const LANGUAGE_KEY = 'sb-debug-language';

function savedLanguage(): DebugLanguage {
  try {
    const v = localStorage.getItem(LANGUAGE_KEY) as DebugLanguage | null;
    return v && DEBUG_LANGUAGES.includes(v) ? v : 'javascript';
  } catch {
    return 'javascript';
  }
}

const STATUSES: { key: DebugStatus | ''; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'NEW', label: 'To do' },
  { key: 'IN_PROGRESS', label: 'In progress' },
  { key: 'SOLVED', label: 'Solved' },
];

/** Debug: a list of fix-the-bugs exercises with filters by level, status, bug type and text. */
@Component({
  selector: 'sb-debug-list-page',
  imports: [RouterLink, FormsModule, TopbarComponent, ErrorStateComponent, SkeletonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <span class="topbar-title">Debug</span>
      <form class="search-box" style="margin-left:auto" role="search" (ngSubmit)="search()">
        <i class="ms" aria-hidden="true">search</i>
        <input aria-label="Search exercises" placeholder="Search exercises" name="q" [(ngModel)]="draft" />
      </form>
    </sb-topbar>

    <div class="page">
      <div class="page-head-text">
        <span class="eyebrow">PRACTICE</span>
        <h1>Debug real code</h1>
        <span class="subline"
          >Each exercise hides several bugs in working-looking code. Read it, run the tests, use the terminal and the AI
          coach, and fix it yourself. Easy has 3+ bugs, Intermediate 5+, Hard 4+ subtle ones.</span
        >
      </div>

      @if (progress(); as p) {
        <section class="panel dbg-progress" aria-label="Your progress">
          <div style="display:flex;flex-direction:column;gap:2px">
            <span class="mono faint" style="font-size:11px">SOLVED</span>
            <b style="font-size:22px"
              >{{ p.solved }} <span class="faint" style="font-size:14px">/ {{ p.total }}</span></b
            >
          </div>
          @for (l of levels; track l) {
            <div class="dbg-level-bar">
              <span class="sm">{{ levelLabel[l] }}</span>
              <div
                class="bar"
                role="progressbar"
                [attr.aria-label]="levelLabel[l] + ' solved'"
                [attr.aria-valuenow]="p.byLevel[l].solved"
                [attr.aria-valuemax]="p.byLevel[l].total"
                aria-valuemin="0"
              >
                <span
                  [style.width.%]="p.byLevel[l].total ? (100 * p.byLevel[l].solved) / p.byLevel[l].total : 0"
                ></span>
              </div>
              <span class="mono faint" style="font-size:11.5px"
                >{{ p.byLevel[l].solved }}/{{ p.byLevel[l].total }}</span
              >
            </div>
          }
        </section>
      }

      <div class="filter-rows">
        <div class="filter-row" role="group" aria-label="Language">
          <span class="label">Language</span>
          @for (l of languages; track l) {
            <button
              type="button"
              class="pill"
              [class.on]="language() === l"
              [attr.aria-pressed]="language() === l"
              (click)="setLanguage(l)"
            >
              {{ languageLabel[l] }}
            </button>
          }
          @if (language() !== 'javascript') {
            <span class="faint" style="font-size:12px"
              >{{ languageLabel[language()] }} has the Easy exercises; Intermediate and Hard are in JavaScript for
              now.</span
            >
          }
        </div>
        <div class="filter-row" role="group" aria-label="Level">
          <span class="label">Level</span>
          <button
            type="button"
            class="pill"
            [class.on]="!level()"
            [attr.aria-pressed]="!level()"
            (click)="level.set('')"
          >
            All
          </button>
          @for (l of levels; track l) {
            <button
              type="button"
              class="pill"
              [class.on]="level() === l"
              [attr.aria-pressed]="level() === l"
              (click)="level.set(l)"
            >
              {{ levelLabel[l] }}
            </button>
          }
        </div>
        <div class="filter-row" role="group" aria-label="Status">
          <span class="label">Status</span>
          @for (s of statuses; track s.key) {
            <button
              type="button"
              class="pill"
              [class.on]="status() === s.key"
              [attr.aria-pressed]="status() === s.key"
              (click)="status.set(s.key)"
            >
              {{ s.label }}
            </button>
          }
        </div>
        <div class="filter-row">
          <label class="label" for="bug-type">Bug type</label>
          <select
            id="bug-type"
            class="select"
            [ngModel]="category()"
            (ngModelChange)="category.set($event)"
            name="category"
          >
            <option value="">All bug types</option>
            @for (c of categories; track c) {
              <option [value]="c">{{ categoryLabel[c] }}</option>
            }
          </select>
          @if (filtered()) {
            <button type="button" class="link-btn" (click)="clear()">Clear filters</button>
          }
        </div>
      </div>

      @if (error(); as e) {
        <sb-error-state [error]="e" (retry)="load()" />
      } @else if (!items()) {
        <div class="dbg-grid">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="dbg-card"><sb-skeleton [rows]="4" /></div>
          }
        </div>
      } @else {
        <span class="faint sm">{{ shown().length }} exercise{{ shown().length === 1 ? '' : 's' }}</span>
        <div class="dbg-grid">
          @for (e of shown(); track e.slug) {
            <a class="dbg-card" [routerLink]="['/debug', e.slug]">
              <div style="display:flex;align-items:center;gap:8px">
                <span class="dbg-level" [class]="'dbg-level ' + levelClass[e.level]">{{ levelLabel[e.level] }}</span>
                <span
                  class="status"
                  [class]="'status ' + statusView[e.status].tone"
                  style="margin-left:auto;font-size:12px"
                  ><i class="ms" aria-hidden="true">{{ statusView[e.status].icon }}</i
                  >{{ statusView[e.status].label }}</span
                >
              </div>
              <b class="dbg-card-title">{{ e.title }}</b>
              <span class="sm muted">{{ e.topic }}</span>
              <div class="chips">
                @for (c of e.categories.slice(0, 3); track c) {
                  <span class="tag">{{ categoryLabel[c] }}</span>
                }
                @if (e.categories.length > 3) {
                  <span class="tag">+{{ e.categories.length - 3 }}</span>
                }
              </div>
              <span class="faint mono" style="font-size:11.5px;margin-top:auto"
                >{{ e.bugCount }} bugs · ~{{ e.estimatedMinutes }} min</span
              >
            </a>
          } @empty {
            <div class="empty" style="grid-column:1/-1">
              <span class="empty-text">No exercises match these filters.</span>
              <button type="button" class="btn btn-secondary" (click)="clear()">Clear filters</button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class DebugListPage {
  private readonly api = inject(Api);

  readonly levels = DEBUG_LEVELS;
  readonly languages = DEBUG_LANGUAGES;
  readonly languageLabel = DEBUG_LANGUAGE_LABEL;
  readonly statuses = STATUSES;
  readonly categories = BUG_CATEGORIES;
  readonly levelLabel = DEBUG_LEVEL_LABEL;
  readonly levelClass = LEVEL_CLASS;
  readonly categoryLabel = BUG_CATEGORY_LABEL;
  readonly statusView = STATUS_VIEW;

  readonly items = signal<DebugExerciseSummary[] | null>(null);
  /** The learner's language, remembered in this browser. */
  readonly language = signal<DebugLanguage>(savedLanguage());
  readonly inLanguage = computed(() => (this.items() ?? []).filter((e) => e.language === this.language()));
  readonly progress = computed(() => (this.items() ? progressFor(this.inLanguage()) : null));
  readonly error = signal<ApiError | null>(null);
  readonly level = signal<DebugLevel | ''>('');
  readonly status = signal<DebugStatus | ''>('');
  readonly category = signal<BugCategory | ''>('');
  readonly q = signal('');
  draft = '';

  /** Filtering happens here: the whole catalogue is small and already loaded. */
  readonly shown = computed(() => {
    const q = this.q().toLowerCase();
    return this.inLanguage().filter(
      (e) =>
        (!this.level() || e.level === this.level()) &&
        (!this.status() || e.status === this.status()) &&
        (!this.category() || e.categories.includes(this.category() as BugCategory)) &&
        (!q || e.title.toLowerCase().includes(q) || e.topic.toLowerCase().includes(q)),
    );
  });
  readonly filtered = computed(() => !!(this.level() || this.status() || this.category() || this.q()));

  constructor() {
    void this.load();
  }

  async load() {
    this.error.set(null);
    try {
      const res = await this.api.debugExercises();
      this.items.set(res.items);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  setLanguage(language: DebugLanguage) {
    this.language.set(language);
    try {
      localStorage.setItem(LANGUAGE_KEY, language);
    } catch {
      // Not remembered; still applies now.
    }
  }

  search() {
    this.q.set(this.draft.trim());
  }

  clear() {
    this.level.set('');
    this.status.set('');
    this.category.set('');
    this.q.set('');
    this.draft = '';
  }
}
