import { safeReturnUrl } from '../features/auth/return-url';
import { applicationSteps, avatarColors, initials, minutesLabel, relativeTime } from './format';

describe('format helpers', () => {
  it('builds initials', () => {
    expect(initials('Manoj Kumar')).toBe('MK');
    expect(initials('Priya')).toBe('PR');
    expect(initials('  ')).toBe('?');
    expect(initials('Anna Maria von Berg')).toBe('AB');
  });

  it('gives a stable avatar colour per key', () => {
    expect(avatarColors('u-1')).toEqual(avatarColors('u-1'));
  });

  it('formats relative times', () => {
    const now = Date.parse('2026-10-14T12:00:00Z');
    expect(relativeTime('2026-10-14T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-10-14T11:48:00Z', now)).toBe('12m');
    expect(relativeTime('2026-10-14T09:00:00Z', now)).toBe('3h');
    expect(relativeTime('2026-10-13T09:00:00Z', now)).toBe('Yesterday');
  });

  it('formats minutes', () => {
    expect(minutesLabel(45)).toBe('45m');
    expect(minutesLabel(90)).toBe('1.5h');
    expect(minutesLabel(720)).toBe('12h');
  });

  it('maps application status to the five-step bar', () => {
    expect(applicationSteps('SUBMITTED')).toBe(1);
    expect(applicationSteps('UNDER_REVIEW')).toBe(3);
    expect(applicationSteps('SELECTED')).toBe(4);
    expect(applicationSteps('WITHDRAWN')).toBe(0);
  });
});

describe('safeReturnUrl', () => {
  it('allows in-app paths', () => {
    expect(safeReturnUrl('/projects/x?y=1')).toBe('/projects/x?y=1');
  });

  it('blocks open redirects and loops', () => {
    expect(safeReturnUrl('https://evil.test')).toBe('/home');
    expect(safeReturnUrl('//evil.test')).toBe('/home');
    expect(safeReturnUrl('/\\evil.test')).toBe('/home');
    expect(safeReturnUrl('/login')).toBe('/home');
    expect(safeReturnUrl(undefined)).toBe('/home');
  });
});
