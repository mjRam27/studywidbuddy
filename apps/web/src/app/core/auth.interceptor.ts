import { HttpErrorResponse, type HttpInterceptorFn, type HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { API } from './api-error';
import { AuthService } from './auth.service';

/** Routes that manage the session themselves and must never trigger a refresh loop. */
const SESSION_ROUTES = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

const withToken = (req: HttpRequest<unknown>, token: string | null) =>
  token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

/**
 * Adds the access token to API calls. On a 401 it refreshes once and retries; if the
 * refresh fails the user is sent to sign in, keeping the page they were on.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(API)) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);
  const isSessionRoute = SESSION_ROUTES.some((r) => req.url.startsWith(API + r));

  return next(withToken(req, auth.token)).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401 || isSessionRoute) return throwError(() => err);
      return auth.refresh().pipe(
        switchMap((token) => {
          if (!token) {
            void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
            return throwError(() => err);
          }
          return next(withToken(req, token));
        }),
      );
    }),
  );
};
