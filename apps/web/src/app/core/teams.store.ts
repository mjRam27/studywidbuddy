import { computed, inject, Injectable, signal } from '@angular/core';
import type { MyMembershipView } from '@studywidbuddy/shared';
import { Api } from './api';

/** The signed-in user's team memberships (sidebar "live workspaces", invitations, home). */
@Injectable({ providedIn: 'root' })
export class TeamsStore {
  private readonly api = inject(Api);
  readonly memberships = signal<MyMembershipView[]>([]);
  readonly active = computed(() => this.memberships().filter((m) => m.status === 'ACTIVE'));
  readonly invitations = computed(() => this.memberships().filter((m) => m.status === 'INVITED'));

  async load(): Promise<void> {
    try {
      this.memberships.set(await this.api.myTeams());
    } catch {
      /* the sidebar degrades to no project list; pages show their own errors */
    }
  }
}
