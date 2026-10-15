import { computed, inject, Injectable, signal } from '@angular/core';
import type { MyLearningResponse } from '@studywidbuddy/shared';
import { Api } from './api';
import { type ApiError, toApiError } from './api-error';

/**
 * The signed-in user's active course slots. Shared by the sidebar (live workspaces list)
 * and the learning screens, and refreshed after anything that changes enrollments.
 */
@Injectable({ providedIn: 'root' })
export class LearningStore {
  private readonly api = inject(Api);

  readonly data = signal<MyLearningResponse | null>(null);
  readonly error = signal<ApiError | null>(null);
  readonly loading = signal(false);

  readonly active = computed(() => this.data()?.active ?? []);
  readonly maxActive = computed(() => this.data()?.maxActive ?? 4);
  readonly full = computed(() => this.active().length >= this.maxActive());

  async load(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);
    try {
      this.data.set(await this.api.myLearning());
    } catch (e) {
      this.error.set(toApiError(e));
    } finally {
      this.loading.set(false);
    }
  }

  reset() {
    this.data.set(null);
  }
}
