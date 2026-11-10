import { Directive, input, output } from '@angular/core';

const KEY_STEP = 24;

/**
 * A drag handle between two panes. Emits the distance moved in pixels (positive = right or
 * down) while dragging with mouse, touch or pen, and in steps with the arrow keys.
 * `orientation="vertical"` separates columns; `"horizontal"` separates rows.
 */
@Directive({
  selector: '[sbResizeHandle]',
  host: {
    role: 'separator',
    tabindex: '0',
    class: 'resize-handle',
    '[class.rows]': "orientation() === 'horizontal'",
    '[attr.aria-orientation]': 'orientation()',
    '[attr.aria-label]': 'label()',
    '(pointerdown)': 'start($event)',
    '(keydown)': 'key($event)',
    '(dblclick)': 'restore.emit()',
  },
})
export class ResizeHandleDirective {
  readonly orientation = input<'vertical' | 'horizontal'>('vertical');
  readonly label = input('Resize');
  readonly resized = output<number>();
  /** Double-click restores the default size. */
  readonly restore = output<void>();

  start(event: PointerEvent) {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    const pos = (e: PointerEvent) => (this.orientation() === 'vertical' ? e.clientX : e.clientY);
    let last = pos(event);
    handle.setPointerCapture(event.pointerId);
    document.body.classList.add('resizing');
    const move = (e: PointerEvent) => {
      const now = pos(e);
      if (now !== last) this.resized.emit(now - last);
      last = now;
    };
    const end = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', end);
      handle.removeEventListener('pointercancel', end);
      document.body.classList.remove('resizing');
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  key(event: KeyboardEvent) {
    const back = this.orientation() === 'vertical' ? 'ArrowLeft' : 'ArrowUp';
    const forward = this.orientation() === 'vertical' ? 'ArrowRight' : 'ArrowDown';
    if (event.key !== back && event.key !== forward) return;
    event.preventDefault();
    this.resized.emit(event.key === forward ? KEY_STEP : -KEY_STEP);
  }
}
