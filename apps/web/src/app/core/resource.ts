import { signal } from '@angular/core';
import { type ApiError, toApiError } from './api-error';

/**
 * Tiny async-state holder for a screen's data: loading → value | error. Keeps every page's
 * loading/empty/error handling identical without pulling in a state library.
 */
export function asyncState<T>(load: () => Promise<T>) {
  const value = signal<T | undefined>(undefined);
  const error = signal<ApiError | null>(null);
  const loading = signal(true);

  async function reload(): Promise<void> {
    loading.set(true);
    error.set(null);
    try {
      value.set(await load());
    } catch (e) {
      error.set(toApiError(e));
    } finally {
      loading.set(false);
    }
  }

  void reload();
  return { value, error, loading, reload, set: (v: T) => value.set(v) };
}

export type AsyncState<T> = ReturnType<typeof asyncState<T>>;
