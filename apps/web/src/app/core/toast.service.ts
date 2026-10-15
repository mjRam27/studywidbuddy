import { Injectable, signal } from '@angular/core';

export type ToastKind = 'ok' | 'error' | 'info';

export interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
  action?: { label: string; run: () => void };
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private seq = 0;
  readonly toasts = signal<Toast[]>([]);

  show(kind: ToastKind, message: string, action?: Toast['action'], ttlMs = 5000) {
    const toast: Toast = { id: ++this.seq, kind, message, action };
    this.toasts.update((t) => [...t.slice(-2), toast]);
    setTimeout(() => this.dismiss(toast.id), ttlMs);
  }

  ok(message: string, action?: Toast['action']) {
    this.show('ok', message, action);
  }

  error(message: string, action?: Toast['action']) {
    this.show('error', message, action, 8000);
  }

  dismiss(id: number) {
    this.toasts.update((t) => t.filter((x) => x.id !== id));
  }
}
