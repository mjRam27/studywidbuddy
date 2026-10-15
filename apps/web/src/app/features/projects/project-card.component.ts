import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ProjectSummary } from '@studywidbuddy/shared';
import { LevelBadgeComponent } from '../../ui/level-badge.component';
import { projectStatus, seatArray } from './project-status';

@Component({
  selector: 'sb-project-card',
  imports: [RouterLink, LevelBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let p = project();
    <article class="project-card" [attr.aria-labelledby]="'p-' + p.id">
      <div class="head">
        <span class="eyebrow">{{ p.category }}</span>
        <sb-level-badge [level]="p.difficulty" style="margin-left:auto" />
        <span class="p-status" [class]="'p-status ' + status().cls"
          ><span class="dot" aria-hidden="true"></span>{{ status().label }}</span
        >
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <a class="t" [id]="'p-' + p.id" [routerLink]="['/projects', p.slug]">{{ p.title }}</a>
        <span class="d">{{ p.summary }}</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px">
        <span class="eyebrow">TEAM NEEDED</span>
        <div class="roles-grid">
          @for (r of p.roles; track r.key) {
            <div class="role-row">
              <span class="grow">{{ r.title }} ×{{ r.seats }}</span>
              <span class="seats" [attr.aria-label]="r.open + ' of ' + r.seats + ' seats open'">
                @for (filled of seats(r.seats, r.open); track $index) {
                  <span [class.filled]="filled"></span>
                }
              </span>
            </div>
          }
        </div>
      </div>
      <div class="chips">
        @for (s of p.techStack; track s.id) {
          @if (matched().has(s.id)) {
            <span class="chip match"
              ><i class="ms" aria-hidden="true">check</i>{{ s.name }}<span class="sr-only">(you have this)</span></span
            >
          } @else {
            <span class="chip">{{ s.name }}</span>
          }
        }
      </div>
      <div class="foot">
        <span>{{ p.durationWeeks }} weeks</span>
        <span>{{ p.applicantCount }} applicant{{ p.applicantCount === 1 ? '' : 's' }}</span>
        <span>{{ openSeats() }} open of {{ p.teamSize }}</span>
        <a class="btn btn-secondary" [routerLink]="['/projects', p.slug]" [attr.aria-label]="'View ' + p.title"
          >View Project</a
        >
      </div>
    </article>
  `,
  styles: [':host{display:contents}'],
})
export class ProjectCardComponent {
  readonly project = input.required<ProjectSummary>();
  readonly status = computed(() => projectStatus(this.project()));
  readonly matched = computed(() => new Set(this.project().skillMatch?.matchedSkillIds ?? []));
  readonly openSeats = computed(() => this.project().roles.reduce((n, r) => n + r.open, 0));
  readonly seats = seatArray;
}
