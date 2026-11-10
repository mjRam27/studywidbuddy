import type { ContributionItem } from '@studywidbuddy/shared';
import {
  buildCalendar,
  type DatedItem,
  formatDuration,
  itemsOn,
  parseKinds,
  projectItems,
  studyItems,
} from './calendar';

const item = (kind: ContributionItem['kind'], title = kind): ContributionItem => ({
  kind,
  title,
  detail: null,
  link: null,
});
const keys = ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'];

describe('parseKinds', () => {
  it('keeps valid kinds, ignores case and junk, defaults to all', () => {
    expect(parseKinds('debug, study,nope')).toEqual(['DEBUG', 'STUDY']);
    expect(parseKinds('')).toHaveLength(5);
    expect(parseKinds(undefined)).toHaveLength(5);
  });
});

describe('buildCalendar', () => {
  const items: DatedItem[] = [
    { date: '2026-11-08', item: item('DEBUG') },
    { date: '2026-11-09', item: item('DEBUG') },
    { date: '2026-11-09', item: item('TASK') },
    { date: '2026-11-10', item: item('STUDY') },
    { date: '2025-01-01', item: item('TASK') }, // outside the window
  ];

  it('counts items per day, lists kinds, totals, active days and the streak', () => {
    const c = buildCalendar(items, keys, parseKinds(''), 'Asia/Kolkata');
    expect(c.days.map((d) => d.count)).toEqual([0, 1, 2, 1]);
    expect(c.days[2].kinds).toEqual(['DEBUG', 'TASK']);
    expect(c.totals).toEqual({ DEBUG: 2, STUDY: 1, TASK: 1, PROJECT: 0, INTERVIEW: 0 });
    expect([c.activeDays, c.streak, c.from, c.to]).toEqual([3, 3, '2026-11-07', '2026-11-10']);
  });

  it('filters by kind', () => {
    const c = buildCalendar(items, keys, ['DEBUG'], 'UTC');
    expect(c.days.map((d) => d.count)).toEqual([0, 1, 1, 0]);
    expect(c.streak).toBe(2); // today is empty, so the streak counts through yesterday
  });

  it('returns one day’s items', () => {
    expect(itemsOn(items, '2026-11-09', ['TASK']).map((i) => i.kind)).toEqual(['TASK']);
  });
});

describe('studyItems', () => {
  const course = (slug: string) => ({ slug, title: slug.toUpperCase() });

  it('counts a day only from 30 minutes in total, one item per course', () => {
    const rows = [
      { day: '2026-11-09', seconds: 20 * 60, course: course('rxjs') },
      { day: '2026-11-09', seconds: 15 * 60, course: course('angular') },
      { day: '2026-11-10', seconds: 29 * 60, course: course('rxjs') },
    ];
    const out = studyItems(rows, new Map([['2026-11-09|rxjs', 2]]));
    expect(out.map((d) => [d.date, d.item.title, d.item.detail])).toEqual([
      ['2026-11-09', 'Studied RXJS', '20 min · 2 lessons completed'],
      ['2026-11-09', 'Studied ANGULAR', '15 min'],
    ]);
  });
});

describe('projectItems', () => {
  it('groups a day’s work per project and summarises it', () => {
    const p = { slug: 'hub', title: 'Campus Hub' };
    const rows = ['a', 'b', 'c', 'd'].map((summary) => ({ date: '2026-11-09', project: p, summary }));
    const [one] = projectItems(rows);
    expect(one.item).toEqual({
      kind: 'PROJECT',
      title: 'Worked on Campus Hub',
      detail: 'a; b; c and 1 more',
      link: '/projects/hub/workspace',
    });
  });
});

describe('formatDuration', () => {
  it('reads like a person would say it', () => {
    expect([formatDuration(null), formatDuration(20), formatDuration(600), formatDuration(3900)]).toEqual([
      null,
      'under a minute',
      '10 min',
      '1 h 5 min',
    ]);
  });
});
