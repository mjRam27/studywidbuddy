import { burndown, sprintHealth } from './workspace.service';

const d = (s: string) => new Date(s);

describe('burndown', () => {
  const sprint = { startsAt: d('2026-10-06T09:00:00Z'), endsAt: d('2026-10-10T18:00:00Z') };
  const tasks = [
    { estimate: 5, completedAt: d('2026-10-07T12:00:00Z') },
    { estimate: 3, completedAt: d('2026-10-08T12:00:00Z') },
    { estimate: 8, completedAt: null },
  ];

  it('counts down completed points per day and leaves future days empty', () => {
    expect(burndown(sprint, tasks, d('2026-10-08T15:00:00Z'))).toEqual([
      { date: '2026-10-06', remaining: 16 },
      { date: '2026-10-07', remaining: 11 },
      { date: '2026-10-08', remaining: 8 },
      { date: '2026-10-09', remaining: null },
      { date: '2026-10-10', remaining: null },
    ]);
  });
});

describe('sprint health', () => {
  it('is on track when remaining work matches an even pace', () => {
    expect(sprintHealth({ total: 40, remaining: 20, elapsed: 0.5, blocked: 0, overdue: 0, daysLeft: 5 }).health).toBe(
      'ON_TRACK',
    );
  });

  it('is at risk when behind pace or when work is blocked', () => {
    expect(sprintHealth({ total: 40, remaining: 26, elapsed: 0.5, blocked: 0, overdue: 0, daysLeft: 5 }).health).toBe(
      'AT_RISK',
    );
    const blocked = sprintHealth({ total: 40, remaining: 20, elapsed: 0.5, blocked: 2, overdue: 0, daysLeft: 5 });
    expect(blocked.health).toBe('AT_RISK');
    expect(blocked.reasons).toContain('2 tasks are blocked by unfinished dependencies.');
  });

  it('is off track when far behind', () => {
    const h = sprintHealth({ total: 40, remaining: 35, elapsed: 0.8, blocked: 0, overdue: 0, daysLeft: 2 });
    expect(h.health).toBe('OFF_TRACK');
    expect(h.reasons[0]).toBe('35 of 40 pts left with 2 days to go (on pace would be 8).');
  });
});
