import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ApiErrorBody, ErrorCode } from '@studywidbuddy/shared';
import type { Response } from 'express';
import { AiError } from '../../ai/ai-provider';
import { DomainError } from './domain-error';

const STATUS_CODES: Partial<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  429: ErrorCode.RATE_LIMITED,
};

/** One place that shapes every error response. Stack traces are logged, never returned. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exceptions');

  catch(exception: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    res.status(status).json(body);
  }

  private toResponse(e: unknown): { status: number; body: ApiErrorBody } {
    if (e instanceof DomainError) {
      return { status: e.status, body: { error: { code: e.code, message: e.message, details: e.details } } };
    }
    if (e instanceof AiError) return aiErrorResponse(e);
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const payload = e.getResponse();
      const raw =
        typeof payload === 'object' && payload !== null ? (payload as { message?: unknown }).message : payload;
      const isValidation = status === 400 && Array.isArray(raw);
      return {
        status,
        body: {
          error: {
            code: STATUS_CODES[status] ?? (status >= 500 ? ErrorCode.INTERNAL : ErrorCode.VALIDATION_FAILED),
            message: isValidation ? 'Some fields are invalid.' : typeof raw === 'string' ? raw : e.message,
            details: isValidation ? raw : undefined,
          },
        },
      };
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === 'P2002') {
        return { status: 409, body: { error: { code: ErrorCode.CONFLICT, message: 'That already exists.' } } };
      }
      if (e.code === 'P2025') {
        return { status: 404, body: { error: { code: ErrorCode.NOT_FOUND, message: 'Not found.' } } };
      }
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: ErrorCode.INTERNAL, message: 'Something went wrong on our side. Please try again.' } },
    };
  }
}

/** AI failures on the request path (tutor chat): say what happened, never leak provider details. */
function aiErrorResponse(e: AiError): { status: number; body: ApiErrorBody } {
  switch (e.kind) {
    case 'NOT_CONFIGURED':
      return {
        status: 503,
        body: {
          error: { code: ErrorCode.AI_NOT_CONFIGURED, message: 'AI features aren’t available on this server yet.' },
        },
      };
    case 'REFUSED':
      return {
        status: 422,
        body: {
          error: { code: ErrorCode.AI_UNAVAILABLE, message: 'The AI couldn’t help with that one. Try rephrasing.' },
        },
      };
    default:
      return {
        status: 503,
        body: {
          error: { code: ErrorCode.AI_UNAVAILABLE, message: 'The AI is busy right now. Please try again shortly.' },
        },
      };
  }
}
