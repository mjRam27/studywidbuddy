import {
  CONTRIBUTION_KINDS,
  STUDY_MINUTES_FOR_A_DAY,
  type ContributionCalendar,
  type ContributionItem,
  type ContributionKind,
} from '@studywidbuddy/shared';
import { streakLength } from '../enrollments/learning-stats';

/**
 * Pure helpers for the contribution graph. Sources are turned into dated items (one item =
 * one thing worth showing for that day); the calendar counts items per day.
 */

export interface DatedItem {
  /** YYYY-MM-DD in the profile owner's timezone. */
  date: string;
  item: ContributionItem;
}

/** "DEBUG,STUDY" → the valid kinds; empty or unknown → all kinds. */
export function parseKinds(raw: string | undefined): ContributionKind[] {
  const wanted = (raw ?? '')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is ContributionKind => (CONTRIBUTION_KINDS as string[]).includes(s));
  return wanted.length ? [...new Set(wanted)] : CONTRIBUTION_KINDS;
}

export function buildCalendar(
  items: DatedItem[],
  dayKeys: string[],
  kinds: ContributionKind[],
  timezone: string,
): ContributionCalendar {
  const keep = new Set(kinds);
  const byDay = new Map<string, ContributionItem[]>();
  for (const d of items) {
    if (!keep.has(d.item.kind)) continue;
    byDay.set(d.date, [...(byDay.get(d.date) ?? []), d.item]);
  }
  const totals = Object.fromEntries(CONTRIBUTION_KINDS.map((k) => [k, 0])) as Record<ContributionKind, number>;
  const days = dayKeys.map((date) => {
    const list = byDay.get(date) ?? [];
    for (const i of list) totals[i.kind]++;
    return { date, count: list.length, kinds: CONTRIBUTION_KINDS.filter((k) => list.some((i) => i.kind === k)) };
  });
  const active = new Set(days.filter((d) => d.count > 0).map((d) => d.date));
  return {
    timezone,
    from: dayKeys[0],
    to: dayKeys[dayKeys.length - 1],
    days,
    totals,
    activeDays: active.size,
    streak: streakLength(active, dayKeys),
  };
}

export function itemsOn(items: DatedItem[], date: string, kinds: ContributionKind[]): ContributionItem[] {
  const keep = new Set(kinds);
  return items.filter((d) => d.date === date && keep.has(d.item.kind)).map((d) => d.item);
}

export function formatDuration(sec: number | null): string | null {
  if (sec === null) return null;
  const min = Math.round(sec / 60);
  if (min < 1) return 'under a minute';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/**
 * Study only counts on days with at least STUDY_MINUTES_FOR_A_DAY of active time, across
 * all courses. Each course studied that day becomes one item.
 */
export function studyItems(
  rows: { day: string; seconds: number; course: { slug: string; title: string } }[],
  lessonsDone: Map<string, number>,
): DatedItem[] {
  const perDay = new Map<string, number>();
  for (const r of rows) perDay.set(r.day, (perDay.get(r.day) ?? 0) + r.seconds);
  return rows
    .filter((r) => (perDay.get(r.day) ?? 0) >= STUDY_MINUTES_FOR_A_DAY * 60 && r.seconds >= 60)
    .map((r) => {
      const lessons = lessonsDone.get(`${r.day}|${r.course.slug}`) ?? 0;
      return {
        date: r.day,
        item: {
          kind: 'STUDY' as const,
          title: `Studied ${r.course.title}`,
          detail: [formatDuration(r.seconds), lessons ? `${lessons} lesson${lessons === 1 ? '' : 's'} completed` : null]
            .filter(Boolean)
            .join(' · '),
          link: `/learn/courses/${r.course.slug}`,
        },
      };
    });
}

/** Project activity, one item per project per day, summarising what was done. */
export function projectItems(
  rows: { date: string; project: { slug: string; title: string }; summary: string }[],
): DatedItem[] {
  const groups = new Map<string, { date: string; project: { slug: string; title: string }; summaries: string[] }>();
  for (const r of rows) {
    const key = `${r.date}|${r.project.slug}`;
    const g = groups.get(key) ?? { date: r.date, project: r.project, summaries: [] };
    g.summaries.push(r.summary);
    groups.set(key, g);
  }
  return [...groups.values()].map((g) => ({
    date: g.date,
    item: {
      kind: 'PROJECT' as const,
      title: `Worked on ${g.project.title}`,
      detail:
        g.summaries.slice(0, 3).join('; ') + (g.summaries.length > 3 ? ` and ${g.summaries.length - 3} more` : ''),
      link: `/projects/${g.project.slug}/workspace`,
    },
  }));
}
