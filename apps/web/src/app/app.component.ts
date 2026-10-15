import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastOutletComponent } from './ui/toast-outlet.component';

@Component({
  selector: 'sb-root',
  imports: [RouterOutlet, ToastOutletComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<router-outlet /><sb-toast-outlet />`,
})
export class AppComponent {}
