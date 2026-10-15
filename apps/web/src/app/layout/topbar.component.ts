import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ShellService } from './shell.service';

/** 56px page header. Pages project their title, tabs or breadcrumbs and actions into it. */
@Component({
  selector: 'sb-topbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="topbar">
      <button type="button" class="icon-btn mobile-menu-btn" aria-label="Open navigation" (click)="shell.toggle()">
        <i class="ms" aria-hidden="true">menu</i>
      </button>
      <ng-content />
    </header>
  `,
  styles: [':host{display:contents}'],
})
export class TopbarComponent {
  readonly shell = inject(ShellService);
}
