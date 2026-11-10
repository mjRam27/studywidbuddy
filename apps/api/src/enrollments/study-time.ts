/**
 * Study time comes from heartbeats the study page sends about once a minute while the
 * learner is active. Each beat is worth the time since the previous one, capped at a
 * minute (a missed beat means the tab was hidden or idle, not studying). Beats closer
 * than MIN_GAP_SEC apart are ignored, so two open tabs don't count double.
 */
export const BEAT_SEC = 60;
const MIN_GAP_SEC = 20;

export function studyCredit(lastBeatAt: Date | null, now: Date): number {
  if (!lastBeatAt) return BEAT_SEC;
  const elapsed = (now.getTime() - lastBeatAt.getTime()) / 1000;
  if (elapsed < MIN_GAP_SEC) return 0;
  return Math.round(Math.min(elapsed, BEAT_SEC));
}
