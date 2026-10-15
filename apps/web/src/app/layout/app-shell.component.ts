import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LearningStore } from '../core/learning.store';
import { TeamsStore } from '../core/teams.store';
import { SidebarComponent } from './sidebar.component';

/** Signed-in layout: sidebar + routed page. Each page renders its own top bar. */
@Component({
  selector: 'sb-app-shell',
  imports: [RouterOutlet, SidebarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="sr-only" href="#main">Skip to content</a>
    <div class="app">
      <sb-sidebar />
      <main class="main" id="main" tabindex="-1">
        <router-outlet />
      </main>
    </div>
  `,
})
export class AppShellComponent implements OnInit {
  private readonly learning = inject(LearningStore);
  private readonly teams = inject(TeamsStore);

  ngOnInit() {
    void this.learning.load();
    void this.teams.load();
  }
}
