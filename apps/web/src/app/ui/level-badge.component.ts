import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { SkillLevel } from '@studywidbuddy/shared';
import { levelBars, levelLabel } from '../core/format';

@Component({
  selector: 'sb-level-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge ' + level().toLowerCase()">{{ label() }}</span>`,
  styles: [':host{display:inline-flex}'],
})
export class LevelBadgeComponent {
  readonly level = input.required<SkillLevel>();
  readonly label = computed(() => levelLabel(this.level()));
}

/** Level bars: 1 beginner · 2 intermediate · 3 advanced, with a text label for screen readers. */
@Component({
  selector: 'sb-level-bars',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="level-bars" aria-hidden="true">
      <span class="on"></span><span [class.on]="bars() >= 2"></span><span [class.on]="bars() >= 3"></span>
    </span>
    <span class="sr-only">{{ label() }}</span>
  `,
  styles: [':host{display:inline-flex;align-items:center}'],
})
export class LevelBarsComponent {
  readonly level = input.required<SkillLevel>();
  readonly bars = computed(() => levelBars(this.level()));
  readonly label = computed(() => levelLabel(this.level()));
}
