import { HttpStatus } from '@nestjs/common';
import { EnrollmentStatus } from '@prisma/client';
import { ErrorCode, MAX_ACTIVE_COURSES } from '@studywidbuddy/shared';
import { conflict, DomainError } from '../common/errors/domain-error';

/**
 * Pure business rules for enrollments, kept free of I/O so they can be unit-tested directly.
 * EnrollmentsService gathers the facts (under a row lock) and asks these functions.
 */

export function assertCanEnroll(facts: { activeCount: number; alreadyActiveInCourse: boolean }): void {
  if (facts.alreadyActiveInCourse) {
    throw conflict(ErrorCode.ALREADY_ENROLLED, "You're already taking this course.");
  }
  if (facts.activeCount >= MAX_ACTIVE_COURSES) {
    throw conflict(
      ErrorCode.ACTIVE_COURSE_LIMIT_REACHED,
      `You can have up to ${MAX_ACTIVE_COURSES} active courses. Complete or leave a course to start another.`,
      { active: facts.activeCount, max: MAX_ACTIVE_COURSES },
    );
  }
}

export function assertActive(status: EnrollmentStatus): void {
  if (status !== EnrollmentStatus.ACTIVE) {
    throw new DomainError(
      ErrorCode.ENROLLMENT_NOT_ACTIVE,
      'This course is no longer active for you.',
      HttpStatus.CONFLICT,
    );
  }
}

export function assertCanComplete(facts: { status: EnrollmentStatus; completedLessons: number; totalLessons: number }) {
  assertActive(facts.status);
  if (facts.totalLessons === 0 || facts.completedLessons < facts.totalLessons) {
    throw new DomainError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `Finish all lessons first (${facts.completedLessons} of ${facts.totalLessons} done).`,
      HttpStatus.CONFLICT,
    );
  }
}

export const progressPercent = (completed: number, total: number) =>
  total === 0 ? 0 : Math.round((completed / total) * 100);
