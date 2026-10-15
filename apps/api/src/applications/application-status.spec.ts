import { ApplicationStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import { DomainError } from '../common/errors/domain-error';
import { assertTransition, canTransition, isTerminal } from './application-status';

const S = ApplicationStatus;

describe('application status machine', () => {
  it('follows the interview path to a decision', () => {
    const path = [S.SUBMITTED, S.INTERVIEW_PENDING, S.INTERVIEW_IN_PROGRESS, S.UNDER_REVIEW, S.SELECTED];
    for (let i = 0; i < path.length - 1; i++) expect(canTransition(path[i], path[i + 1])).toBe(true);
  });

  it('lets the applicant withdraw before a decision', () => {
    for (const s of [S.SUBMITTED, S.INTERVIEW_PENDING, S.INTERVIEW_IN_PROGRESS, S.UNDER_REVIEW]) {
      expect(canTransition(s, S.WITHDRAWN)).toBe(true);
    }
  });

  it('treats decisions and withdrawal as final', () => {
    for (const s of [S.SELECTED, S.REJECTED, S.WITHDRAWN]) {
      expect(isTerminal(s)).toBe(true);
      for (const to of Object.values(S)) expect(canTransition(s, to)).toBe(false);
    }
  });

  it('does not allow skipping the interview', () => {
    expect(canTransition(S.SUBMITTED, S.SELECTED)).toBe(false);
    expect(canTransition(S.SUBMITTED, S.UNDER_REVIEW)).toBe(false);
  });

  it('does not reject mid-interview (the candidate finishes first)', () => {
    expect(canTransition(S.INTERVIEW_IN_PROGRESS, S.REJECTED)).toBe(false);
  });

  it('throws a 409 with the attempted transition', () => {
    try {
      assertTransition(S.WITHDRAWN, S.SUBMITTED);
      fail('expected to throw');
    } catch (e) {
      const err = e as DomainError;
      expect(err.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      expect(err.status).toBe(409);
      expect(err.details).toEqual({ from: S.WITHDRAWN, to: S.SUBMITTED });
    }
  });
});
