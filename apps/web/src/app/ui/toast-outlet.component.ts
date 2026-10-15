import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../core/toast.service';

@Component({
  selector: 'sb-toast-outlet',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" role="status" aria-live="polite">
      @for (t of toasts.toasts(); track t.id) {
        <div class="toast" [class.ok]="t.kind === 'ok'" [class.error]="t.kind === 'error'">
          <i class="ms" aria-hidden="true">{{
            t.kind === 'ok' ? 'check_circle' : t.kind === 'error' ? 'error' : 'info'
          }}</i>
          <span class="grow">{{ t.message }}</span>
          @if (t.action; as a) {
            <button type="button" (click)="a.run(); toasts.dismiss(t.id)">{{ a.label }}</button>
          }
          <button type="button" aria-label="Dismiss" (click)="toasts.dismiss(t.id)">
            <i class="ms" aria-hidden="true" style="font-size:16px;color:#A3AABB">close</i>
          </button>
        </div>
      }
    </div>
  `,
})
export class ToastOutletComponent {
  readonly toasts = inject(ToastService);
}
