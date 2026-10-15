import { dayKey, lastDays, safeTimeZone, streakLength } from './learning-stats';

describe('learning stats', () => {
  it('keys days in the user timezone', () => {
    const lateEvening = new Date('2026-10-13T23:30:00Z');
    expect(dayKey(lateEvening, 'UTC')).toBe('2026-10-13');
    expect(dayKey(lateEvening, 'Europe/Berlin')).toBe('2026-10-14');
  });

  it('falls back to UTC for unknown zones', () => {
    expect(safeTimeZone('Nowhere/Land')).toBe('UTC');
    expect(safeTimeZone(null)).toBe('UTC');
    expect(safeTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it('builds a window of days ending today', () => {
    const keys = lastDays(new Date('2026-10-14T12:00:00Z'), 3, 'UTC');
    expect(keys).toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });

  describe('streak', () => {
    const keys = ['d1', 'd2', 'd3', 'd4', 'd5'];

    it('counts back from today', () => {
      expect(streakLength(new Set(['d3', 'd4', 'd5']), keys)).toBe(3);
    });

    it('keeps yesterday’s streak alive before today’s first lesson', () => {
      expect(streakLength(new Set(['d2', 'd3', 'd4']), keys)).toBe(3);
    });

    it('is zero after a missed day', () => {
      expect(streakLength(new Set(['d1', 'd2', 'd3']), keys)).toBe(0);
    });
  });
});
