import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { TopbarComponent } from '../layout/topbar.component';

interface SoonData {
  title: string;
  icon: string;
  milestone: string;
  text: string;
}

/** Honest placeholder for a section that isn't built yet. No fake data, no dead buttons. */
@Component({
  selector: 'sb-coming-soon-page',
  imports: [RouterLink, TopbarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (data(); as d) {
      <sb-topbar
        ><span class="topbar-title">{{ d.title }}</span></sb-topbar
      >
      <div class="page narrow">
        <div class="empty dashed" style="padding:40px;gap:12px">
          <i class="ms" aria-hidden="true">{{ d.icon }}</i>
          <span class="eyebrow">COMING IN · {{ d.milestone.toUpperCase() }}</span>
          <span class="empty-title" style="font-size:20px">{{ d.title }} isn’t here yet</span>
          <span class="empty-text">{{ d.text }}</span>
          <div style="display:flex;gap:8px;margin-top:6px">
            <a class="btn btn-primary" routerLink="/learn">Go to My Learning</a>
            <a class="btn btn-secondary" routerLink="/projects">Browse projects</a>
          </div>
        </div>
      </div>
    }
  `,
})
export class ComingSoonPage {
  readonly data = toSignal(inject(ActivatedRoute).data.pipe(map((d) => d as SoonData)));
}
