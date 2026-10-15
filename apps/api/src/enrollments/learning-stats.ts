/** Pure helpers for learning statistics. Day keys are YYYY-MM-DD in the user's timezone. */

export function dayKey(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function safeTimeZone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

/** The last `n` day keys ending at `now`, oldest first. */
export function lastDays(now: Date, n: number, timeZone: string): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(dayKey(new Date(now.getTime() - i * 86_400_000), timeZone));
  // Around DST changes two offsets can map to the same key; keep order, drop duplicates.
  return [...new Set(keys)];
}

/**
 * Streak = consecutive active days ending today. If today has no activity yet, the streak
 * still counts through yesterday (you haven't broken it until the day is over).
 */
export function streakLength(activeDays: Set<string>, orderedKeys: string[]): number {
  let i = orderedKeys.length - 1;
  if (i >= 0 && !activeDays.has(orderedKeys[i])) i--;
  let streak = 0;
  while (i >= 0 && activeDays.has(orderedKeys[i])) {
    streak++;
    i--;
  }
  return streak;
}
