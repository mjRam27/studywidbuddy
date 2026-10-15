import { Injectable, signal } from '@angular/core';

/** Mobile/tablet sidebar state (below 1024px the sidebar becomes a drawer). */
@Injectable({ providedIn: 'root' })
export class ShellService {
  readonly sidebarOpen = signal(false);
  toggle() {
    this.sidebarOpen.update((v) => !v);
  }
  close() {
    this.sidebarOpen.set(false);
  }
}
