import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { type ApiError } from '../core/api-error';

/** Error state with retry. Shows the server's message; never a stack trace. */
@Component({
  selector: 'sb-error-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty" role="alert">
      <i class="ms" aria-hidden="true">{{ error()?.code === 'NETWORK' ? 'cloud_off' : 'error' }}</i>
      <span class="empty-title">{{ title() }}</span>
      <span class="empty-text">{{ error()?.message ?? 'Something went wrong.' }}</span>
      <button type="button" class="btn btn-secondary" (click)="retry.emit()">
        <i class="ms" aria-hidden="true">refresh</i>Retry
      </button>
    </div>
  `,
})
export class ErrorStateComponent {
  readonly error = input<ApiError | null>(null);
  readonly title = input("This didn't load");
  readonly retry = output<void>();
}

/** Placeholder rows while data loads. */
@Component({
  selector: 'sb-skeleton',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sk-wrap" aria-busy="true" aria-live="polite">
      <span class="sr-only">Loading…</span>
      @for (r of rowsArr(); track $index) {
        <div class="skeleton" [style.height.px]="height()" [style.width]="$last && rows() > 1 ? '60%' : '100%'"></div>
      }
    </div>
  `,
  styles: ['.sk-wrap{display:flex;flex-direction:column;gap:10px}'],
})
export class SkeletonComponent {
  readonly rows = input(3);
  readonly height = input(14);
  rowsArr() {
    return Array.from({ length: this.rows() });
  }
}
