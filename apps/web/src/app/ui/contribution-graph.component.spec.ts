import type { ContributionDay } from '@studywidbuddy/shared';
import { cellLabel, levelOf, monthLabels, toWeeks } from './contribution-graph.component';

const days = (from: string, n: number, count = (_i: number) => 0): ContributionDay[] =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.parse(`${from}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
    const c = count(i);
    return { date, count: c, kinds: c ? ['DEBUG'] : [] };
  });

describe('contribution graph layout', () => {
  it('starts weeks on Sunday, padding the first week', () => {
    // 2026-11-04 is a Wednesday: three empty cells before it.
    const weeks = toWeeks(days('2026-11-04', 10));
    expect(weeks[0].slice(0, 3)).toEqual([null, null, null]);
    expect(weeks[0][3]?.day.date).toBe('2026-11-04');
    expect(weeks).toHaveSize(2);
    expect(weeks[1][0]?.day.date).toBe('2026-11-08');
  });

  it('maps counts to five shades', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(levelOf)).toEqual([0, 1, 2, 2, 3, 3, 4]);
  });

  it('labels months where they start', () => {
    const weeks = toWeeks(days('2026-09-01', 70));
    expect(monthLabels(weeks).map((m) => m.text)).toEqual(['Sep', 'Oct', 'Nov']);
  });

  it('describes each day for screen readers', () => {
    expect(cellLabel({ date: '2026-11-09', count: 2, kinds: ['DEBUG', 'STUDY'] })).toBe(
      '2 things on Mon, 9 Nov 2026: debugging, studying',
    );
    expect(cellLabel({ date: '2026-11-10', count: 0, kinds: [] })).toBe('Nothing on Tue, 10 Nov 2026');
  });
});
