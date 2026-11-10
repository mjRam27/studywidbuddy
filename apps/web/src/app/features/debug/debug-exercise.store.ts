import { computed, inject, Injectable, signal } from '@angular/core';
import {
  DEBUG_TEST_FILES,
  type DebugAssistantMessage,
  type DebugAttemptView,
  type DebugExerciseView,
  type DebugReview,
} from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';
import type { TermLine } from '../../ui/terminal.component';
import { DebugRunner } from './debug-runner';
import { asText, COMMANDS, formatResponse, help, parseCommand } from './terminal';

type Files = Record<string, string>;

const draftKey = (slug: string) => `sb-debug:${slug}`;

function loadDraft(slug: string): Files | null {
  try {
    const raw = localStorage.getItem(draftKey(slug));
    return raw ? (JSON.parse(raw) as Files) : null;
  } catch {
    return null;
  }
}

function saveDraft(slug: string, files: Files | null) {
  try {
    if (files) localStorage.setItem(draftKey(slug), JSON.stringify(files));
    else localStorage.removeItem(draftKey(slug));
  } catch {
    // Private mode or full storage: drafts are a convenience only.
  }
}

/**
 * State for one Debug exercise: the learner's files (drafts survive a reload), test runs in
 * a Web Worker, terminal commands, run recording (the first green run solves it) and the
 * assistant chat. The assistant never changes files; only the learner does.
 */
@Injectable()
export class DebugExerciseStore {
  private readonly api = inject(Api);
  private readonly runner = inject(DebugRunner);

  readonly exercise = signal<DebugExerciseView | null>(null);
  readonly loadError = signal<ApiError | null>(null);
  readonly files = signal<Files>({});
  readonly activePath = signal('');
  readonly lines = signal<TermLine[]>([]);
  readonly running = signal(false);
  readonly lastRun = signal('');
  readonly attempt = signal<DebugAttemptView | null>(null);
  readonly review = signal<DebugReview | null>(null);
  /** True right after the solving run, to celebrate once. */
  readonly justSolved = signal(false);

  readonly chat = signal<DebugAssistantMessage[]>([]);
  readonly asking = signal(false);
  readonly solutionMode = signal(false);

  readonly original = computed<Files>(() =>
    Object.fromEntries((this.exercise()?.files ?? []).map((f) => [f.path, f.content])),
  );
  readonly editablePaths = computed(() => (this.exercise()?.files ?? []).filter((f) => !f.readOnly).map((f) => f.path));
  readonly activeFile = computed(() => this.exercise()?.files.find((f) => f.path === this.activePath()) ?? null);
  readonly activeContent = computed(() => this.files()[this.activePath()] ?? '');
  readonly modified = computed(
    () => new Set(this.editablePaths().filter((p) => this.files()[p] !== this.original()[p])),
  );
  readonly solved = computed(() => this.attempt()?.status === 'SOLVED');
  readonly language = computed(() => this.exercise()?.language ?? 'javascript');
  private readonly testFile = computed(() => DEBUG_TEST_FILES[this.language()]);

  private slug = '';

  async load(slug: string) {
    this.slug = slug;
    this.loadError.set(null);
    this.exercise.set(null);
    this.review.set(null);
    this.chat.set([]);
    this.justSolved.set(false);
    try {
      const ex = await this.api.debugExercise(slug);
      const draft = loadDraft(slug);
      const files = Object.fromEntries(
        ex.files.map((f) => [f.path, f.readOnly ? f.content : (draft?.[f.path] ?? f.content)]),
      );
      this.exercise.set(ex);
      this.files.set(files);
      this.activePath.set(ex.files.find((f) => !f.readOnly)?.path ?? ex.files[0].path);
      this.lines.set([
        { tone: 'muted', text: `${ex.title}: ${ex.bugCount} bugs are hidden in this code.` },
        {
          tone: 'muted',
          text: `Run the tests with ${COMMANDS[ex.language].test} (or Ctrl+Enter). Type help for all commands.`,
        },
      ]);
      const attempt = ex.attempt ?? (await this.api.startDebug(slug));
      this.attempt.set(attempt);
      if (attempt.status === 'SOLVED') this.review.set(await this.api.debugReview(slug));
    } catch (e) {
      this.loadError.set(toApiError(e));
    }
  }

  select(path: string) {
    this.activePath.set(path);
  }

  edit(path: string, content: string) {
    if (!this.editablePaths().includes(path) || this.files()[path] === content) return;
    this.files.update((f) => ({ ...f, [path]: content }));
    saveDraft(this.slug, this.editableFiles());
  }

  resetFile(path: string) {
    this.files.update((f) => ({ ...f, [path]: this.original()[path] }));
    saveDraft(this.slug, this.modified().size ? this.editableFiles() : null);
  }

  resetAll() {
    this.files.set({ ...this.original() });
    saveDraft(this.slug, null);
    this.print({ tone: 'muted', text: 'All files reset to the original buggy version.' });
  }

  async command(input: string) {
    const cmd = parseCommand(input);
    if (!cmd) return;
    if (cmd.kind === 'clear') return this.lines.set([]);
    this.print({ tone: 'cmd', text: `$ ${input}` });
    switch (cmd.kind) {
      case 'test':
        return this.runTests(false);
      case 'run':
        return this.runFile(cmd.file);
      case 'ls':
        return this.print(...Object.keys(this.files()).map((text) => ({ tone: 'plain' as const, text })));
      case 'cat': {
        const content = this.files()[cmd.file];
        return this.print(
          ...(content === undefined
            ? [{ tone: 'err' as const, text: `cat: ${cmd.file}: no such file` }]
            : content.split('\n').map((text) => ({ tone: 'plain' as const, text }))),
        );
      }
      case 'help':
        return this.print(...help(this.language()));
      case 'unknown':
        return this.print({ tone: 'err', text: `command not found: ${cmd.input}. Type help.` });
    }
  }

  /** Runs the tests against the learner's files (the tests themselves always come from the server). */
  async runTests(echo = true) {
    if (this.running()) return;
    if (echo) this.print({ tone: 'cmd', text: `$ ${COMMANDS[this.language()].test}` });
    this.running.set(true);
    try {
      this.noteFirstPythonRun();
      const test = this.testFile();
      const res = await this.runner.run({
        kind: 'test',
        language: this.language(),
        files: { ...this.files(), [test]: this.original()[test] },
        entry: test,
      });
      const output = formatResponse(res);
      this.print(...output);
      this.lastRun.set(asText(output));
      if (res.kind === 'test' && !res.report.error) {
        const recorded = await this.api.recordDebugRun(this.slug, {
          passed: res.report.passed,
          failed: res.report.failed,
          files: this.editablePaths().map((path) => ({ path, content: this.files()[path] })),
        });
        const firstSolve = !this.solved() && recorded.attempt.status === 'SOLVED';
        this.attempt.set(recorded.attempt);
        if (recorded.review) this.review.set(recorded.review);
        if (firstSolve) {
          this.justSolved.set(true);
          saveDraft(this.slug, null);
        }
      }
    } catch (e) {
      this.print({ tone: 'err', text: toApiError(e).message });
    } finally {
      this.running.set(false);
    }
  }

  private async runFile(path: string) {
    if (!(path in this.files())) return this.print({ tone: 'err', text: `cannot find ${path}` });
    this.running.set(true);
    try {
      this.noteFirstPythonRun();
      this.print(
        ...formatResponse(
          await this.runner.run({ kind: 'file', language: this.language(), files: this.files(), entry: path }),
        ),
      );
    } finally {
      this.running.set(false);
    }
  }

  private noteFirstPythonRun() {
    if (this.language() === 'python' && this.runner.pythonLoading) {
      this.print({ tone: 'muted', text: 'Starting Python (the first run downloads it, about 10 MB)…' });
    }
  }

  async ask(message: string) {
    const text = message.trim();
    if (!text || this.asking()) return;
    const history = this.chat();
    this.chat.set([...history, { role: 'user', text }]);
    this.asking.set(true);
    try {
      const { reply } = await this.api.askDebugAssistant(this.slug, {
        message: text,
        files: this.editablePaths().map((path) => ({ path, content: this.files()[path] })),
        activeFile: this.activePath(),
        lastRun: this.lastRun() || undefined,
        history,
        solution: this.solutionMode(),
      });
      this.chat.update((c) => [...c, { role: 'assistant', text: reply }]);
      const a = this.attempt();
      if (this.solutionMode() && a && !a.solvedAt) this.attempt.set({ ...a, solutionViewed: true });
    } catch (e) {
      this.chat.update((c) => [...c, { role: 'assistant', text: `⚠ ${toApiError(e).message}` }]);
    } finally {
      this.asking.set(false);
    }
  }

  private editableFiles(): Files {
    return Object.fromEntries(this.editablePaths().map((p) => [p, this.files()[p]]));
  }

  private print(...lines: TermLine[]) {
    this.lines.update((l) => [...l, ...lines].slice(-400));
  }
}
