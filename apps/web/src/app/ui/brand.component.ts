import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'sb-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="brand" [routerLink]="link()" aria-label="StudywidBuddy home">
      <span class="brand-mark" aria-hidden="true"><span></span><span></span></span>
      <span class="brand-name">Studywid<span>Buddy</span></span>
    </a>
  `,
  styles: [':host{display:contents}'],
})
export class BrandComponent {
  readonly link = input('/home');
}
