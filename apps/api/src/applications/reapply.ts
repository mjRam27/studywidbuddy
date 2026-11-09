import { REAPPLY_COOLDOWN_DAYS } from '@studywidbuddy/shared';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Whether a candidate rejected on `rejectedAt` may apply to the same project again: after the
 * cooldown, or earlier once they completed one of the recommended courses since the rejection.
 */
export function reapplyState(rejectedAt: Date, now: Date, completedRecommendedCourse: boolean) {
  const availableAt = new Date(rejectedAt.getTime() + REAPPLY_COOLDOWN_DAYS * DAY);
  const cooled = now.getTime() >= availableAt.getTime();
  return {
    allowed: cooled || completedRecommendedCourse,
    availableAt,
    viaCourse: !cooled && completedRecommendedCourse,
  };
}

/**
 * The role's required skills that count as gaps: the ones the evaluator named (matched
 * case-insensitively against real skill names, so invented names are dropped). Older
 * evaluations have no list; for those, skills mentioned in "areas to improve" are used.
 */
export function skillGapsFor(required: string[], named: string[], areasToImprove: string[] = []): string[] {
  const byLower = new Map(required.map((s) => [s.toLowerCase(), s]));
  const picked = named.map((n) => byLower.get(n.trim().toLowerCase())).filter((s): s is string => !!s);
  if (picked.length) return [...new Set(picked)];
  const text = areasToImprove.join(' ').toLowerCase();
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return required.filter((s) => new RegExp(`(^|[^a-z0-9])${escape(s.toLowerCase())}([^a-z0-9]|$)`).test(text));
}
