import { HttpStatus } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import { DomainError } from '../common/errors/domain-error';

/**
 * Application lifecycle. SUBMITTED (CV being screened) → INTERVIEW_PENDING (CV ≥ 80, booking
 * a voice interview) → INTERVIEW_IN_PROGRESS → UNDER_REVIEW (evaluating) → SELECTED (seat)
 * or REJECTED (CV or interview below the bar, or the role filled up meanwhile).
 * The applicant may withdraw at any point before a decision.
 */
const TRANSITIONS: Record<ApplicationStatus, readonly ApplicationStatus[]> = {
  SUBMITTED: ['INTERVIEW_PENDING', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW_PENDING: ['INTERVIEW_IN_PROGRESS', 'REJECTED', 'WITHDRAWN'],
  INTERVIEW_IN_PROGRESS: ['UNDER_REVIEW', 'WITHDRAWN'],
  UNDER_REVIEW: ['SELECTED', 'REJECTED', 'WITHDRAWN'],
  SELECTED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const canTransition = (from: ApplicationStatus, to: ApplicationStatus) => TRANSITIONS[from].includes(to);

export function assertTransition(from: ApplicationStatus, to: ApplicationStatus): void {
  if (!canTransition(from, to)) {
    throw new DomainError(
      ErrorCode.INVALID_STATUS_TRANSITION,
      `An application that is ${humanize(from)} can't become ${humanize(to)}.`,
      HttpStatus.CONFLICT,
      { from, to },
    );
  }
}

export const isTerminal = (s: ApplicationStatus) => TRANSITIONS[s].length === 0;

const humanize = (s: ApplicationStatus) => s.toLowerCase().replace(/_/g, ' ');
