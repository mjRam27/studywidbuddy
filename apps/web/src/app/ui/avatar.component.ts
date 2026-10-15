import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { avatarColors, initials } from '../core/format';

/** Initials avatar with the design's palette. `buddy` adds the indigo partner ring. */
@Component({
  selector: 'sb-avatar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="avatar"
      [class.buddy]="buddy()"
      [style.width.px]="size()"
      [style.height.px]="size()"
      [style.font-size.px]="fontSize()"
      [style.background]="src() ? null : colors().bg"
      [style.color]="colors().fg"
      [attr.aria-hidden]="decorative() ? 'true' : null"
      [attr.aria-label]="decorative() ? null : name()"
      [attr.role]="decorative() ? null : 'img'"
    >
      @if (src(); as s) {
        <img [src]="s" alt="" />
      } @else {
        {{ text() }}
      }
      @if (presence() !== null) {
        <span class="presence" [class.online]="presence()"></span>
      }
    </span>
  `,
  styles: [':host{display:inline-flex}'],
})
export class AvatarComponent {
  readonly name = input.required<string>();
  /** Colour key, e.g. user id. Defaults to the name. */
  readonly colorKey = input<string | undefined>(undefined);
  readonly size = input(28);
  readonly src = input<string | null>(null);
  readonly buddy = input(false);
  /** null = don't show presence. */
  readonly presence = input<boolean | null>(null);
  readonly decorative = input(true);
  /** Force the signed-in user's own colours (design: lavender). */
  readonly self = input(false);

  readonly text = computed(() => initials(this.name()));
  readonly fontSize = computed(() => Math.round(this.size() * 0.38));
  readonly colors = computed(() =>
    this.self() ? { bg: '#DDE3FF', fg: '#3236B3' } : avatarColors(this.colorKey() ?? this.name()),
  );
}
