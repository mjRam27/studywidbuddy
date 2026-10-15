import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EnrollmentView } from '@studywidbuddy/shared';
import { levelLabel } from '../../core/format';
import { ClickOutsideDirective } from '../../ui/click-outside.directive';

/** One active course slot on My Learning. */
@Component({
  selector: 'sb-course-card',
  imports: [RouterLink, ClickOutsideDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article
      class="course-card"
      (sbClickOutside)="menuOpen.set(false)"
      [attr.aria-labelledby]="'course-' + enrollment().id"
    >
      <div class="course-top">
        <span class="eyebrow">SLOT {{ slot() }} · {{ enrollment().course.category }}</span>
        <button
          type="button"
          class="icon-btn sm"
          [class.on]="menuOpen()"
          (click)="menuOpen.set(!menuOpen())"
          [attr.aria-label]="enrollment().course.title + ' options'"
          [attr.aria-expanded]="menuOpen()"
          aria-haspopup="menu"
        >
          <i class="ms" aria-hidden="true">more_horiz</i>
        </button>
      </div>
      <div class="course-title">
        <a
          class="display"
          [id]="'course-' + enrollment().id"
          [routerLink]="['/learn/courses', enrollment().course.slug]"
          >{{ enrollment().course.title }}</a
        >
        <span>{{ levelLabel(enrollment().level) }}</span>
      </div>
      <div class="progress" [attr.aria-label]="enrollment().progress + '% complete'">
        <div class="progress-track"><div [style.width.%]="enrollment().progress"></div></div>
        <span class="mono">{{ enrollment().progress }}%</span>
      </div>
      <!-- Study Buddy partnerships arrive in milestone 8; until then the slot says so plainly. -->
      <div class="buddy-row none">
        <span class="buddy-slot-icon" aria-hidden="true"><i class="ms">person_add</i></span>
        <div class="buddy-text"><span>Study Buddy</span><span>Matching opens soon</span></div>
      </div>
      <div class="facts">
        <span>Module</span
        ><span class="ellipsis">{{
          enrollment().currentModule
            ? enrollment().currentModule!.position + ' · ' + enrollment().currentModule!.title
            : 'All modules done'
        }}</span>
        <span>Next</span
        ><span class="ellipsis">{{
          enrollment().nextLesson
            ? enrollment().nextLesson!.label + ' ' + enrollment().nextLesson!.title
            : 'Ready to complete'
        }}</span>
        <span>Session</span><span class="faint">Not scheduled</span>
      </div>
      <a
        class="btn btn-continue"
        [class.btn-primary]="primary()"
        [class.btn-secondary]="!primary()"
        [routerLink]="['/learn/courses', enrollment().course.slug]"
      >
        {{ enrollment().progress === 100 ? 'Finish course' : 'Continue Learning'
        }}<i class="ms" aria-hidden="true">arrow_forward</i>
      </a>
      @if (menuOpen()) {
        <div class="menu" role="menu">
          <a role="menuitem" [routerLink]="['/learn/courses', enrollment().course.slug]"
            ><i class="ms" aria-hidden="true">menu_book</i>Course outline</a
          >
          <button type="button" role="menuitem" disabled>
            <i class="ms" aria-hidden="true">event</i>Schedule session<span class="soon">SOON</span>
          </button>
          <button type="button" role="menuitem" disabled>
            <i class="ms" aria-hidden="true">swap_horiz</i>Change Study Buddy<span class="soon">SOON</span>
          </button>
          <div class="menu-sep"></div>
          <button type="button" role="menuitem" class="danger" (click)="menuOpen.set(false); leave.emit()">
            <i class="ms" aria-hidden="true">logout</i>Leave course…
          </button>
        </div>
      }
    </article>
  `,
  styles: [':host{display:contents}'],
})
export class CourseCardComponent {
  readonly enrollment = input.required<EnrollmentView>();
  readonly slot = input.required<number>();
  readonly primary = input(false);
  readonly leave = output<void>();
  readonly menuOpen = signal(false);
  readonly levelLabel = levelLabel;
}
