import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@studywidbuddy/shared';

/**
 * A failure the caller can act on (broken business rule, missing resource, …).
 * Services throw these; the exception filter turns them into `{ error: { code, message } }`.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: HttpStatus = HttpStatus.UNPROCESSABLE_ENTITY,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what: string) =>
  new DomainError(ErrorCode.NOT_FOUND, `${what} not found.`, HttpStatus.NOT_FOUND);

export const forbidden = (message = "You don't have access to this.") =>
  new DomainError(ErrorCode.FORBIDDEN, message, HttpStatus.FORBIDDEN);

export const conflict = (code: ErrorCode, message: string, details?: unknown) =>
  new DomainError(code, message, HttpStatus.CONFLICT, details);
