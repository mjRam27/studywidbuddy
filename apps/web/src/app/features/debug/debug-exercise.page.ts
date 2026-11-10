import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { BUG_CATEGORY_LABEL, DEBUG_LANGUAGE_LABEL, DEBUG_LEVEL_LABEL } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { TopbarComponent } from '../../layout/topbar.component';
import { CodeEditorComponent } from '../../ui/code-editor.component';
import { ErrorStateComponent, SkeletonComponent } from '../../ui/states.component';
import { ResizeHandleDirective } from '../../ui/resize-handle.directive';
import { TerminalComponent } from '../../ui/terminal.component';
import { DebugAssistantComponent } from './debug-assistant.component';
import { DebugExerciseStore } from './debug-exercise.store';
import { duration, LEVEL_CLASS, STATUS_VIEW } from './debug-format';
import { DebugReviewComponent } from './debug-review.component';
import { DebugRunner } from './debug-runner';
import { PaneSizes } from './pane-sizes';

/** A Debug exercise: the brief and files, a code editor, a terminal, and the AI coach / review. */
@Component({
  selector: 'sb-debug-exercise-page',
  imports: [
    RouterLink,
    TopbarComponent,
    CodeEditorComponent,
    TerminalComponent,
    ResizeHandleDirective,
    DebugAssistantComponent,
    DebugReviewComponent,
    ErrorStateComponent,
    SkeletonComponent,
  ],
  providers: [DebugExerciseStore, DebugRunner],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sb-topbar>
      <nav class="crumbs" aria-label="Breadcrumb">
        <a routerLink="/debug">Debug</a><i class="ms" aria-hidden="true">chevron_right</i>
        <span class="ellipsis">{{ store.exercise()?.title ?? 'Exercise' }}</span>
      </nav>
      @if (store.attempt(); as a) {
        <span
          class="dbg-timer mono"
          style="margin-left:auto"
          [title]="a.solvedAt ? 'Time to solve' : 'Time since you opened it'"
        >
          <i class="ms" aria-hidden="true">timer</i>{{ elapsed() }}
        </span>
        <span class="status" [class]="'status ' + status().tone"
          ><i class="ms" aria-hidden="true">{{ status().icon }}</i
          >{{ status().label }}</span
        >
      }
    </sb-topbar>

    @if (store.loadError(); as e) {
      <div class="page"><sb-error-state [error]="e" (retry)="store.load(slug())" /></div>
    } @else if (!store.exercise()) {
      <div class="page"><sb-skeleton [rows]="10" /></div>
    } @else {
      @let ex = store.exercise()!;
      <div
        class="dbg-ws"
        [style.--dbg-side]="panes.get('side') + 'px'"
        [style.--dbg-right]="panes.get('right') + 'px'"
        [style.--dbg-term]="panes.get('terminal') + 'px'"
      >
        <aside class="dbg-side" aria-label="Exercise">
          <div class="dbg-brief">
            <div class="chips">
              <span class="dbg-level" [class]="'dbg-level ' + levelClass[ex.level]">{{ levelLabel[ex.level] }}</span>
              <span class="tag"><i class="ms" aria-hidden="true">bug_report</i>{{ ex.bugCount }} bugs</span>
              <span class="tag"><i class="ms" aria-hidden="true">schedule</i>~{{ ex.estimatedMinutes }} min</span>
            </div>
            <h1 class="dbg-title">{{ ex.title }}</h1>
            <nav class="dbg-langs" aria-label="Language">
              @for (v of ex.variants; track v.slug) {
                <a
                  class="pill"
                  [class.on]="v.slug === ex.slug"
                  [attr.aria-current]="v.slug === ex.slug ? 'page' : null"
                  [routerLink]="['/debug', v.slug]"
                  >{{ languageLabel[v.language] }}</a
                >
              }
              @if (ex.variants.length === 1) {
                <span class="faint" style="font-size:11.5px">Only in {{ languageLabel[ex.language] }} for now</span>
              }
            </nav>
            <p class="sm" style="margin:0;line-height:1.55">{{ ex.brief }}</p>
            <div class="chips">
              @for (c of ex.categories; track c) {
                <span class="tag">{{ categoryLabel[c] }}</span>
              }
            </div>
          </div>

          <span class="section-label">FILES</span>
          <ul class="dbg-files" role="listbox" aria-label="Files">
            @for (f of ex.files; track f.path) {
              <li
                role="option"
                tabindex="0"
                [attr.aria-selected]="f.path === store.activePath()"
                [class.on]="f.path === store.activePath()"
                (click)="store.select(f.path)"
                (keydown.enter)="store.select(f.path)"
              >
                <i class="ms" aria-hidden="true">{{ f.readOnly ? 'lock' : 'code' }}</i>
                <span class="mono grow">{{ f.path }}</span>
                @if (store.modified().has(f.path)) {
                  <span class="dbg-dot" title="Changed"><span class="sr-only">changed</span></span>
                }
              </li>
            }
          </ul>
          <div style="display:flex;gap:6px;flex-wrap:wrap">
            @if (store.modified().has(store.activePath())) {
              <button type="button" class="btn btn-ghost xs" (click)="store.resetFile(store.activePath())">
                <i class="ms" aria-hidden="true">undo</i>Reset this file
              </button>
            }
            @if (store.modified().size) {
              <button type="button" class="btn btn-ghost xs" (click)="resetAll()">
                <i class="ms" aria-hidden="true">restart_alt</i>Reset all
              </button>
            }
          </div>
        </aside>
        <div
          sbResizeHandle
          class="dbg-handle-side"
          label="Resize the files panel"
          (resized)="panes.resize('side', $event)"
          (restore)="panes.reset('side')"
        ></div>

        <section class="dbg-main" aria-label="Code">
          <div class="dbg-toolbar">
            <span class="mono sm">{{ store.activePath() }}</span>
            @if (store.activeFile()?.readOnly) {
              <span class="tag"><i class="ms" aria-hidden="true">lock</i>read-only tests</span>
            }
            <button
              type="button"
              class="btn btn-primary xs"
              style="margin-left:auto"
              [disabled]="store.running()"
              (click)="store.runTests()"
              title="Run the tests (Ctrl+Enter)"
            >
              <i class="ms" aria-hidden="true">play_arrow</i>Run tests
            </button>
          </div>
          <sb-code-editor
            class="dbg-editor"
            [value]="store.activeContent()"
            [readOnly]="!!store.activeFile()?.readOnly"
            [language]="store.language()"
            [label]="'Code editor: ' + store.activePath()"
            (valueChange)="store.edit(store.activePath(), $event)"
            (run)="store.runTests()"
          />
          <div
            sbResizeHandle
            orientation="horizontal"
            label="Resize the terminal"
            (resized)="panes.resize('terminal', -$event)"
            (restore)="panes.reset('terminal')"
          ></div>
          <sb-terminal
            class="dbg-terminal"
            [lines]="store.lines()"
            [busy]="store.running()"
            (execute)="store.command($event)"
          />
        </section>
        <div
          sbResizeHandle
          class="dbg-handle-right"
          label="Resize the AI coach panel"
          (resized)="panes.resize('right', -$event)"
          (restore)="panes.reset('right')"
        ></div>

        <aside class="dbg-right" aria-label="Help">
          <div class="tabs" role="tablist">
            <button
              type="button"
              role="tab"
              class="tab"
              [class.on]="tab() === 'coach'"
              [attr.aria-selected]="tab() === 'coach'"
              (click)="tab.set('coach')"
            >
              <span class="ai-diamond" aria-hidden="true"></span>AI coach
            </button>
            <button
              type="button"
              role="tab"
              class="tab"
              [class.on]="tab() === 'review'"
              [attr.aria-selected]="tab() === 'review'"
              [disabled]="!store.review()"
              [title]="store.review() ? '' : 'Unlocks when every test passes'"
              (click)="tab.set('review')"
            >
              <i class="ms" aria-hidden="true">{{ store.review() ? 'fact_check' : 'lock' }}</i
              >Review
            </button>
          </div>
          @if (tab() === 'review' && store.review(); as r) {
            <sb-debug-review [review]="r" [next]="next()" (reveal)="reveal($event)" />
          } @else {
            <sb-debug-assistant />
          }
        </aside>
      </div>
    }
  `,
})
export class DebugExercisePage {
  readonly store = inject(DebugExerciseStore);
  private readonly api = inject(Api);

  readonly slug = input.required<string>();
  readonly tab = signal<'coach' | 'review'>('coach');
  readonly next = signal<string | null>(null);
  /** Drag the handles (or focus them and use the arrow keys); double-click resets. */
  readonly panes = new PaneSizes({
    side: { initial: 260, min: 180, max: 480 },
    right: { initial: 380, min: 280, max: 720 },
    terminal: { initial: 220, min: 90, max: 600 },
  });
  private readonly now = signal(Date.now());
  private readonly editor = viewChild(CodeEditorComponent);

  readonly levelLabel = DEBUG_LEVEL_LABEL;
  readonly levelClass = LEVEL_CLASS;
  readonly categoryLabel = BUG_CATEGORY_LABEL;
  readonly languageLabel = DEBUG_LANGUAGE_LABEL;
  readonly status = computed(() => STATUS_VIEW[this.store.attempt()?.status ?? 'NEW']);
  readonly elapsed = computed(() => {
    const a = this.store.attempt();
    if (!a) return '–';
    if (a.durationSec !== null) return duration(a.durationSec);
    // Server and browser clocks differ a little; never show a negative time.
    return duration(Math.max(0, this.now() - Date.parse(a.startedAt)) / 1000);
  });

  constructor() {
    effect(() => {
      const slug = this.slug();
      untracked(() => {
        this.tab.set('coach');
        void this.store.load(slug);
      });
    });
    effect(() => {
      if (!this.store.justSolved()) return;
      untracked(() => {
        this.tab.set('review');
        void this.findNext();
      });
    });
    effect(() => {
      if (this.store.review()) untracked(() => void this.findNext());
    });
    const timer = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  resetAll() {
    if (confirm('Reset every file to the original buggy version? Your changes will be lost.')) this.store.resetAll();
  }

  reveal({ file, line }: { file: string; line: number }) {
    this.store.select(file);
    // Let the editor switch to that file first.
    setTimeout(() => this.editor()?.revealLine(line), 50);
  }

  /** The next unsolved exercise in catalogue order. */
  private async findNext() {
    try {
      const { items } = await this.api.debugExercises();
      const at = items.findIndex((i) => i.slug === this.slug());
      const after = [...items.slice(at + 1), ...items.slice(0, at)].find((i) => i.status !== 'SOLVED');
      this.next.set(after?.slug ?? null);
    } catch {
      this.next.set(null);
    }
  }
}
