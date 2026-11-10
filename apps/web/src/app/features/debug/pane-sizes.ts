import { signal } from '@angular/core';

export interface PaneLimits {
  initial: number;
  min: number;
  max: number;
}

const KEY = 'sb-debug-panes';

/**
 * Sizes (px) of the resizable Debug panes, clamped to their limits and remembered per
 * browser. Storage is a convenience only: it may be unavailable.
 */
export class PaneSizes<K extends string> {
  private readonly sizes;

  constructor(private readonly limits: Record<K, PaneLimits>) {
    const saved = PaneSizes.read();
    this.sizes = signal(
      Object.fromEntries(
        (Object.keys(limits) as K[]).map((k) => [k, this.clamp(k, saved[k] ?? limits[k].initial)]),
      ) as Record<K, number>,
    );
  }

  get(key: K): number {
    return this.sizes()[key];
  }

  resize(key: K, delta: number) {
    this.set(key, this.get(key) + delta);
  }

  reset(key: K) {
    this.set(key, this.limits[key].initial);
  }

  private set(key: K, value: number) {
    this.sizes.update((s) => ({ ...s, [key]: this.clamp(key, value) }));
    try {
      localStorage.setItem(KEY, JSON.stringify(this.sizes()));
    } catch {
      // Not remembered; still works for this visit.
    }
  }

  private clamp(key: K, value: number) {
    const { min, max } = this.limits[key];
    return Math.round(Math.min(max, Math.max(min, value)));
  }

  private static read(): Record<string, number> {
    try {
      return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, number>;
    } catch {
      return {};
    }
  }
}
