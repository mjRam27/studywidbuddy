import { TestBed } from '@angular/core/testing';
import {
  type ActivatedRouteSnapshot,
  provideRouter,
  Router,
  type RouterStateSnapshot,
  type UrlTree,
} from '@angular/router';
import type { CurrentUser } from '@studywidbuddy/shared';
import { AuthService } from './auth.service';
import { appGuard, guestGuard } from './guards';

describe('route guards', () => {
  let user: CurrentUser | null;

  beforeEach(() => {
    user = null;
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: { user: () => user } }],
    });
  });

  const run = (guard: typeof appGuard, url = '/learn') =>
    TestBed.runInInjectionContext(() => guard({} as ActivatedRouteSnapshot, { url } as RouterStateSnapshot));
  const serialize = (r: unknown) => TestBed.inject(Router).serializeUrl(r as UrlTree);

  const make = (onboarded: boolean): CurrentUser => ({
    id: 'u',
    email: 'e@x.test',
    emailVerified: true,
    role: 'USER',
    username: 'u',
    displayName: 'U',
    avatarUrl: null,
    onboarded,
  });

  it('sends signed-out users to login with a return url', () => {
    expect(serialize(run(appGuard, '/projects'))).toBe('/login?returnUrl=%2Fprojects');
  });

  it('sends users who have not onboarded to onboarding', () => {
    user = make(false);
    expect(serialize(run(appGuard))).toBe('/onboarding');
  });

  it('lets onboarded users in', () => {
    user = make(true);
    expect(run(appGuard)).toBeTrue();
  });

  it('keeps signed-in users away from login', () => {
    user = make(true);
    expect(serialize(run(guestGuard))).toBe('/home');
  });
});
