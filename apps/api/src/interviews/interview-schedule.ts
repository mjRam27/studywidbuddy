import { INTERVIEW_BOOKING_DAYS, INTERVIEW_JOIN_EARLY_MIN, INTERVIEW_JOIN_LATE_MIN } from '@studywidbuddy/shared';

/** Bookable hours, in the candidate's local time: 09:00 … 20:00 starts. */
export const FIRST_HOUR = 9;
export const LAST_HOUR = 20;
const STEP_MS = 15 * 60_000;

export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function localParts(d: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? '0');
  return { hour: get('hour'), minute: get('minute') };
}

/**
 * Interview slots on the hour in the candidate's timezone, from the next full hour (at
 * least 30 minutes away) for the next N days. Walking in 15-minute steps means zones with
 * half- and quarter-hour offsets (e.g. India +05:30) still get on-the-hour local slots,
 * and DST changes are handled by Intl.
 */
export function interviewSlots(now: Date, timeZone: string, days = INTERVIEW_BOOKING_DAYS): string[] {
  const tz = safeTimezone(timeZone);
  const start = Math.ceil((now.getTime() + 30 * 60_000) / STEP_MS) * STEP_MS;
  const end = now.getTime() + days * 86_400_000;
  const out: string[] = [];
  for (let t = start; t <= end; t += STEP_MS) {
    const d = new Date(t);
    const { hour, minute } = localParts(d, tz);
    if (minute === 0 && hour >= FIRST_HOUR && hour <= LAST_HOUR) out.push(d.toISOString());
  }
  return out;
}

/** Can a booked interview be joined at `now`? From 10 minutes early to 3 hours late. */
export function canJoin(scheduledFor: Date | null, now: Date): boolean {
  if (!scheduledFor) return false;
  const t = now.getTime();
  return (
    t >= scheduledFor.getTime() - INTERVIEW_JOIN_EARLY_MIN * 60_000 &&
    t <= scheduledFor.getTime() + INTERVIEW_JOIN_LATE_MIN * 60_000
  );
}

/** The slot was missed: too late to join, so the candidate must book again. */
export function isMissed(scheduledFor: Date | null, now: Date): boolean {
  return !!scheduledFor && now.getTime() > scheduledFor.getTime() + INTERVIEW_JOIN_LATE_MIN * 60_000;
}
