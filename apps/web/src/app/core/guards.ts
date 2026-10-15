import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Client-side guards only decide what to *show*. Every rule they mirror is enforced again
 * by the API; these exist so people land on the right screen.
 */

/** Signed in and onboarded. */
export const appGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const user = auth.user();
  if (!user) return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  if (!user.onboarded) return router.createUrlTree(['/onboarding']);
  return true;
};

/** Signed in (onboarding may be incomplete). */
export const signedInGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  return auth.user() ? true : inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** Signed out only (login, register). */
export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user() ? inject(Router).createUrlTree(['/home']) : true;
};

/** Admin-only screens. The API enforces the role on every admin endpoint regardless. */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  return auth.user()?.role === 'ADMIN' ? true : inject(Router).createUrlTree(['/home']);
};
