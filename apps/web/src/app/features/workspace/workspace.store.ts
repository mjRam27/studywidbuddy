import { computed, inject, Injectable, signal } from '@angular/core';
import type { TaskCard, WorkspaceOverview } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';

/** Per-workspace state shared by the tabs and the task drawer. Provided by WorkspacePage. */
@Injectable()
export class WorkspaceStore {
  private readonly api = inject(Api);

  readonly slug = signal('');
  readonly overview = signal<WorkspaceOverview | null>(null);
  readonly tasks = signal<TaskCard[]>([]);
  readonly error = signal<ApiError | null>(null);

  readonly members = computed(() => this.overview()?.members ?? []);
  readonly roles = computed(() => {
    const seen = new Map<string, string>();
    for (const m of this.members()) seen.set(m.role.id, m.role.title);
    for (const t of this.tasks()) if (t.role) seen.set(t.role.id, t.role.title);
    return [...seen].map(([id, title]) => ({ id, title }));
  });

  async load(slug: string) {
    this.slug.set(slug);
    this.error.set(null);
    try {
      const [o, t] = await Promise.all([this.api.workspace(slug), this.api.tasks(slug)]);
      this.overview.set(o);
      this.tasks.set(t);
    } catch (e) {
      this.error.set(toApiError(e));
    }
  }

  /** Refresh after a change. Overview (health, burndown) and cards both derive from tasks. */
  async refresh() {
    const slug = this.slug();
    if (!slug) return;
    const [o, t] = await Promise.all([this.api.workspace(slug), this.api.tasks(slug)]);
    this.overview.set(o);
    this.tasks.set(t);
  }

  replaceTask(card: TaskCard) {
    this.tasks.update((ts) => {
      const i = ts.findIndex((t) => t.id === card.id);
      return i === -1 ? [...ts, card] : ts.map((t) => (t.id === card.id ? card : t));
    });
  }
}
