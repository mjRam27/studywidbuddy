import { reapplyState, skillGapsFor } from './reapply';

const DAY = 86_400_000;

describe('reapplyState', () => {
  const rejectedAt = new Date('2026-11-01T10:00:00Z');

  it('locks the project for 7 days after a rejection', () => {
    const s = reapplyState(rejectedAt, new Date(rejectedAt.getTime() + 6 * DAY), false);
    expect(s).toEqual({ allowed: false, availableAt: new Date('2026-11-08T10:00:00Z'), viaCourse: false });
  });

  it('opens again once the cooldown has passed', () => {
    expect(reapplyState(rejectedAt, new Date('2026-11-08T10:00:00Z'), false)).toMatchObject({
      allowed: true,
      viaCourse: false,
    });
  });

  it('opens early when a recommended course was completed', () => {
    expect(reapplyState(rejectedAt, new Date(rejectedAt.getTime() + DAY), true)).toMatchObject({
      allowed: true,
      viaCourse: true,
    });
  });
});

describe('skillGapsFor', () => {
  const required = ['PostgreSQL', 'NestJS', 'Node.js'];

  it('keeps only real required skills, in their canonical spelling', () => {
    expect(skillGapsFor(required, [' postgresql ', 'Kubernetes', 'POSTGRESQL'])).toEqual(['PostgreSQL']);
  });

  it('falls back to skills named in areas to improve (older evaluations)', () => {
    expect(
      skillGapsFor(required, [], ['Review how a NestJS module groups a controller', 'Practise Node.js streams']),
    ).toEqual(['NestJS', 'Node.js']);
  });

  it('does not match a skill hidden inside another word', () => {
    expect(skillGapsFor(['Go'], [], ['Go deeper on indexing'])).toEqual(['Go']);
    expect(skillGapsFor(['Go'], [], ['Use Django forms'])).toEqual([]);
  });

  it('returns nothing when no gap is named', () => {
    expect(skillGapsFor(required, [], ['Speak a little slower'])).toEqual([]);
  });
});
