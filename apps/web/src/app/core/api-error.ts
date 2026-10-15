import { HttpErrorResponse } from '@angular/common/http';
import { ErrorCode, type ApiErrorBody } from '@studywidbuddy/shared';

/** A normalised API failure the UI can show and branch on. */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK',
    message: string,
    readonly status: number,
    readonly details?: unknown,
  ) {
    super(message);
  }

  /** Field-level validation messages, when the server returned them. */
  get fieldMessages(): string[] {
    return Array.isArray(this.details) ? this.details.filter((d): d is string => typeof d === 'string') : [];
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) {
      return new ApiError('NETWORK', "Can't reach StudywidBuddy. Check your connection and try again.", 0);
    }
    const body = err.error as Partial<ApiErrorBody> | null;
    if (body?.error?.code) {
      return new ApiError(body.error.code, body.error.message, err.status, body.error.details);
    }
    return new ApiError(ErrorCode.INTERNAL, 'Something went wrong on our side. Please try again.', err.status);
  }
  return new ApiError(ErrorCode.INTERNAL, 'Something went wrong. Please try again.', 0);
}

export const API = '/api/v1';
