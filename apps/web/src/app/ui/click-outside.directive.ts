import { Directive, ElementRef, inject, output } from '@angular/core';

/** Emits when a click or Escape happens outside the host. Used to close menus and popovers. */
@Directive({
  selector: '[sbClickOutside]',
  host: {
    '(document:mousedown)': 'onDown($event)',
    '(document:keydown.escape)': 'sbClickOutside.emit()',
  },
})
export class ClickOutsideDirective {
  private readonly el = inject(ElementRef<HTMLElement>);
  readonly sbClickOutside = output<void>();

  onDown(e: MouseEvent) {
    if (!this.el.nativeElement.contains(e.target as Node)) this.sbClickOutside.emit();
  }
}
