import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { JobMatchView } from '@studywidbuddy/shared';

/** Why a job fits: skills you have (proven or claimed) and the gaps. Icon + words, never colour alone. */
@Component({
  selector: 'sb-job-match',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let m = match();
    <div class="job-skills" [class.compact]="compact()">
      @for (s of m.matched; track s.name) {
        <span
          class="job-skill have"
          [title]="s.proven ? 'Proven by a course or project' : 'On your profile (not yet proven)'"
          ><i class="ms" aria-hidden="true">{{ s.proven ? 'verified' : 'check' }}</i
          >{{ s.name }}
          @if (!compact() && !s.proven) {
            <span class="faint">(claimed)</span>
          }
        </span>
      }
      @for (g of m.gaps; track g) {
        <span class="job-skill gap"><i class="ms" aria-hidden="true">add_circle</i>gap: {{ g }}</span>
      }
      @if (m.score === null) {
        <span class="faint sm">No catalogue skills found in this listing.</span>
      }
    </div>
  `,
})
export class JobMatchComponent {
  readonly match = input.required<JobMatchView>();
  readonly compact = input(false);
}
