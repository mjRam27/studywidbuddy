import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { BrandComponent } from '../ui/brand.component';

@Component({
  selector: 'sb-not-found-page',
  imports: [RouterLink, BrandComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="auth-page">
      <header class="public-header">
        <div class="public-header-inner"><sb-brand [link]="auth.user() ? '/home' : '/'" /></div>
      </header>
      <div class="onboard" style="align-items:flex-start;padding-top:96px">
        <span class="eyebrow">404</span>
        <h1>This page doesn’t exist.</h1>
        <p class="subline">The link may be old, or the page may have moved.</p>
        <a class="btn btn-primary lg" [routerLink]="auth.user() ? '/home' : '/'">Go home</a>
      </div>
    </div>
  `,
})
export class NotFoundPage {
  readonly auth = inject(AuthService);
}
