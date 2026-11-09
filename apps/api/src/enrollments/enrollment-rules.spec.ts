import { EnrollmentStatus } from '@prisma/client';
import { ErrorCode, MAX_ACTIVE_COURSES } from '@studywidbuddy/shared';
import { DomainError } from '../common/errors/domain-error';
import { assertCanComplete, assertCanEnroll, maxActiveFor, progressPercent } from './enrollment-rules';

const codeOf = (fn: () => void) => {
  try {
    fn();
  } catch (e) {
    return (e as DomainError).code;
  }
  return null;
};

describe('enrollment rules', () => {
  describe('four active courses', () => {
    it('allows enrolling while below the limit', () => {
      for (let n = 0; n < MAX_ACTIVE_COURSES; n++) {
        expect(codeOf(() => assertCanEnroll({ activeCount: n, alreadyActiveInCourse: false }))).toBeNull();
      }
    });

    it('rejects the fifth active course', () => {
      expect(codeOf(() => assertCanEnroll({ activeCount: 4, alreadyActiveInCourse: false }))).toBe(
        ErrorCode.ACTIVE_COURSE_LIMIT_REACHED,
      );
    });

    it('lets admins (testing) past the limit, always showing one free slot', () => {
      expect(
        codeOf(() => assertCanEnroll({ activeCount: 6, alreadyActiveInCourse: false, superUser: true })),
      ).toBeNull();
      expect(maxActiveFor(true, 6)).toBe(7);
      expect(maxActiveFor(true, 1)).toBe(MAX_ACTIVE_COURSES);
      expect(maxActiveFor(false, 6)).toBe(MAX_ACTIVE_COURSES);
    });

    it('reports a duplicate enrollment before the limit', () => {
      expect(codeOf(() => assertCanEnroll({ activeCount: 4, alreadyActiveInCourse: true }))).toBe(
        ErrorCode.ALREADY_ENROLLED,
      );
    });

    it('returns 409 with the counts in details', () => {
      try {
        assertCanEnroll({ activeCount: 4, alreadyActiveInCourse: false });
        fail('expected to throw');
      } catch (e) {
        expect((e as DomainError).status).toBe(409);
        expect((e as DomainError).details).toEqual({ active: 4, max: 4 });
      }
    });
  });

  describe('completion', () => {
    it('requires every lesson', () => {
      expect(
        codeOf(() => assertCanComplete({ status: EnrollmentStatus.ACTIVE, completedLessons: 9, totalLessons: 10 })),
      ).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
      expect(
        codeOf(() => assertCanComplete({ status: EnrollmentStatus.ACTIVE, completedLessons: 10, totalLessons: 10 })),
      ).toBeNull();
    });

    it('cannot complete a course with no lessons', () => {
      expect(
        codeOf(() => assertCanComplete({ status: EnrollmentStatus.ACTIVE, completedLessons: 0, totalLessons: 0 })),
      ).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    });

    it('cannot complete an enrollment that is not active', () => {
      expect(
        codeOf(() =>
          assertCanComplete({ status: EnrollmentStatus.DEREGISTERED, completedLessons: 3, totalLessons: 3 }),
        ),
      ).toBe(ErrorCode.ENROLLMENT_NOT_ACTIVE);
    });
  });

  it('rounds progress to whole percent', () => {
    expect(progressPercent(0, 0)).toBe(0);
    expect(progressPercent(1, 3)).toBe(33);
    expect(progressPercent(2, 3)).toBe(67);
    expect(progressPercent(3, 3)).toBe(100);
  });
});
