import type { UserRole } from '../enums';

export interface RegisterRequest {
  email: string;
  password: string;
  displayName: string;
  username: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface CurrentUser {
  id: string;
  email: string;
  emailVerified: boolean;
  role: UserRole;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  onboarded: boolean;
}

export interface AuthResponse {
  accessToken: string;
  /** Seconds until the access token expires. */
  expiresIn: number;
  user: CurrentUser;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
}

export interface VerifyEmailRequest {
  token: string;
}

/** Header the SPA sends with cookie-authenticated requests (refresh/logout) as a CSRF guard. */
export const CSRF_HEADER = 'x-studywidbuddy-csrf';
