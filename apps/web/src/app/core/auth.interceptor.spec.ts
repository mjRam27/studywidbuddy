import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { AuthResponse } from '@studywidbuddy/shared';
import { firstValueFrom } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

const session = (token: string): AuthResponse => ({
  accessToken: token,
  expiresIn: 900,
  user: {
    id: 'u1',
    email: 'a@b.test',
    emailVerified: true,
    role: 'USER',
    username: 'a',
    displayName: 'A',
    avatarUrl: null,
    onboarded: true,
  },
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let auth: AuthService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
  });

  afterEach(() => ctrl.verify());

  async function signIn(token: string) {
    const p = auth.login({ email: 'a@b.test', password: 'x' });
    ctrl.expectOne('/api/v1/auth/login').flush(session(token));
    await p;
  }

  it('adds the bearer token to API calls only', async () => {
    await signIn('t1');
    void firstValueFrom(http.get('/api/v1/me/learning'));
    expect(ctrl.expectOne('/api/v1/me/learning').request.headers.get('Authorization')).toBe('Bearer t1');
    void firstValueFrom(http.get('/assets/x.json'));
    expect(ctrl.expectOne('/assets/x.json').request.headers.has('Authorization')).toBeFalse();
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    await signIn('old');
    const result = firstValueFrom(http.get<{ ok: boolean }>('/api/v1/me/learning'));
    ctrl.expectOne('/api/v1/me/learning').flush({}, { status: 401, statusText: 'Unauthorized' });

    const refresh = ctrl.expectOne('/api/v1/auth/refresh');
    expect(refresh.request.headers.get('x-studywidbuddy-csrf')).toBe('1');
    refresh.flush(session('new'));

    const retry = ctrl.expectOne('/api/v1/me/learning');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new');
    retry.flush({ ok: true });
    expect(await result).toEqual({ ok: true });
  });

  it('shares one refresh between concurrent 401s', async () => {
    await signIn('old');
    const a = firstValueFrom(http.get('/api/v1/a'));
    const b = firstValueFrom(http.get('/api/v1/b'));
    ctrl.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/auth/refresh').flush(session('new'));
    ctrl.expectOne('/api/v1/a').flush(1);
    ctrl.expectOne('/api/v1/b').flush(2);
    expect(await Promise.all([a, b])).toEqual([1, 2]);
  });

  it('signs out and goes to login when the refresh fails', async () => {
    await signIn('old');
    const router = TestBed.inject(Router);
    const nav = spyOn(router, 'navigate').and.resolveTo(true);
    const result = firstValueFrom(http.get('/api/v1/me/learning')).catch((e) => e.status);
    ctrl.expectOne('/api/v1/me/learning').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(await result).toBe(401);
    expect(auth.user()).toBeNull();
    expect(nav).toHaveBeenCalledWith(['/login'], jasmine.objectContaining({ queryParams: jasmine.any(Object) }));
  });

  it('never tries to refresh a failed login', async () => {
    const p = auth.login({ email: 'a@b.test', password: 'bad' }).catch((e) => e.status);
    ctrl
      .expectOne('/api/v1/auth/login')
      .flush({ error: { code: 'INVALID_CREDENTIALS', message: 'x' } }, { status: 401, statusText: 'Unauthorized' });
    expect(await p).toBe(401);
    ctrl.expectNone('/api/v1/auth/refresh');
  });
});
