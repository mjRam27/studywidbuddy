import { Injectable, signal } from '@angular/core';

const COLLAPSED_KEY = 'sb-nav-collapsed';
const DRAWER_QUERY = '(max-width: 1023px)';

function readCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Navigation state. On wide screens the burger collapses the sidebar (remembered per
 * browser); below 1024px the sidebar is a drawer that the burger opens and closes.
 */
@Injectable({ providedIn: 'root' })
export class ShellService {
  readonly sidebarOpen = signal(false);
  readonly collapsed = signal(readCollapsed());

  toggle() {
    if (matchMedia(DRAWER_QUERY).matches) {
      this.sidebarOpen.update((v) => !v);
      return;
    }
    this.collapsed.update((v) => !v);
    try {
      localStorage.setItem(COLLAPSED_KEY, this.collapsed() ? '1' : '0');
    } catch {
      // Private mode: the choice just isn't remembered.
    }
  }

  close() {
    this.sidebarOpen.set(false);
  }

  /** Whether the navigation is currently visible (for aria-expanded). */
  expanded() {
    return matchMedia(DRAWER_QUERY).matches ? this.sidebarOpen() : !this.collapsed();
  }
}
