import { HttpClient, HttpHeaders } from '@angular/common/http';
import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  CSRF_HEADER,
  type AuthResponse,
  type CurrentUser,
  type LoginRequest,
  type RegisterRequest,
} from '@studywidbuddy/shared';
import { catchError, finalize, firstValueFrom, map, type Observable, of, shareReplay, tap } from 'rxjs';
import { API } from './api-error';

/**
 * Session state. The access token lives only in memory; the refresh token is an httpOnly
 * cookie the browser sends to /api/v1/auth/*. A page reload restores the session through
 * one refresh call at startup.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  private readonly _user = signal<CurrentUser | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  private accessToken: string | null = null;
  private inflightRefresh: Observable<string | null> | null = null;

  get token(): string | null {
    return this.accessToken;
  }

  /** Called once at app start. Never throws: a failed refresh just means "signed out". */
  async restoreSession(): Promise<void> {
    await firstValueFrom(this.refresh());
  }

  async login(body: LoginRequest): Promise<CurrentUser> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${API}/auth/login`, body));
    return this.setSession(res);
  }

  async register(body: RegisterRequest): Promise<CurrentUser> {
    const res = await firstValueFrom(this.http.post<AuthResponse>(`${API}/auth/register`, body));
    return this.setSession(res);
  }

  /**
   * Rotates the refresh cookie and returns a new access token, or null when the session is
   * gone. Concurrent callers share one request so the token is only rotated once.
   */
  refresh(): Observable<string | null> {
    this.inflightRefresh ??= this.http
      .post<AuthResponse>(`${API}/auth/refresh`, null, { headers: this.csrfHeaders() })
      .pipe(
        map((res) => {
          this.setSession(res);
          return res.accessToken;
        }),
        catchError(() => {
          this.clear();
          return of(null);
        }),
        finalize(() => (this.inflightRefresh = null)),
        shareReplay(1),
      );
    return this.inflightRefresh;
  }

  async logout(): Promise<void> {
    try {
      await firstValueFrom(this.http.post(`${API}/auth/logout`, null, { headers: this.csrfHeaders() }));
    } finally {
      this.clear();
      await this.router.navigateByUrl('/login');
    }
  }

  /** Re-reads the current user (after onboarding, email verification, profile edits). */
  reloadUser(): Promise<CurrentUser> {
    return firstValueFrom(this.http.get<CurrentUser>(`${API}/auth/me`).pipe(tap((u) => this._user.set(u))));
  }

  patchUser(patch: Partial<CurrentUser>) {
    const u = this._user();
    if (u) this._user.set({ ...u, ...patch });
  }

  /** Drops the in-memory session without calling the server (used after a 401 we can't recover). */
  clear() {
    this.accessToken = null;
    this._user.set(null);
  }

  private setSession(res: AuthResponse): CurrentUser {
    this.accessToken = res.accessToken;
    this._user.set(res.user);
    return res.user;
  }

  private csrfHeaders() {
    return new HttpHeaders({ [CSRF_HEADER]: '1' });
  }
}
