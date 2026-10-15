import { type CandidateInput, type RoleInput, roleFit, selectTeam } from './selection';

const backend: RoleInput = {
  id: 'r-be',
  title: 'Backend',
  seats: 1,
  requiredSkills: [
    { skillId: 's-nest', name: 'NestJS', minLevel: 'INTERMEDIATE' },
    { skillId: 's-pg', name: 'PostgreSQL', minLevel: 'INTERMEDIATE' },
  ],
};
const frontend: RoleInput = {
  id: 'r-fe',
  title: 'Frontend',
  seats: 1,
  requiredSkills: [{ skillId: 's-ng', name: 'Angular', minLevel: 'INTERMEDIATE' }],
};

function cand(
  id: string,
  p: Partial<Omit<CandidateInput, 'skills'>> & {
    skills?: Record<string, ['BEGINNER' | 'INTERMEDIATE' | 'ADVANCED', boolean]>;
  },
): CandidateInput {
  return {
    applicationId: id,
    userId: `u-${id}`,
    name: id,
    appliedRoleId: p.appliedRoleId ?? backend.id,
    recommendedRoleId: p.recommendedRoleId ?? null,
    hoursPerWeek: p.hoursPerWeek ?? 10,
    evaluation: p.evaluation === undefined ? { overall: 70, technical: 70 } : p.evaluation,
    skills: new Map(Object.entries(p.skills ?? {}).map(([k, [level, proven]]) => [k, { level, proven }])),
  };
}

describe('roleFit', () => {
  it('rewards proven skills over self-reported ones', () => {
    const proven = roleFit(
      cand('a', { skills: { 's-nest': ['INTERMEDIATE', true], 's-pg': ['INTERMEDIATE', true] } }),
      backend,
    );
    const claimed = roleFit(
      cand('b', { skills: { 's-nest': ['INTERMEDIATE', false], 's-pg': ['INTERMEDIATE', false] } }),
      backend,
    );
    expect(proven.value).toBeGreaterThan(claimed.value);
    expect(proven.skillsMet).toEqual(['NestJS (proven)', 'PostgreSQL (proven)']);
  });

  it('gives partial credit one level below and none further', () => {
    const f = roleFit(cand('a', { skills: { 's-nest': ['BEGINNER', false] } }), backend);
    expect(f.skillsMissing).toEqual(['NestJS (one level below)', 'PostgreSQL']);
  });
});

describe('selectTeam', () => {
  it('is not "top N by overall score": a specialist keeps the seat only they can fill', () => {
    // The generalist has the best interview and could do either role; the specialist can only do frontend.
    const generalist = cand('generalist', {
      appliedRoleId: frontend.id,
      evaluation: { overall: 95, technical: 95 },
      skills: { 's-nest': ['ADVANCED', true], 's-pg': ['ADVANCED', true], 's-ng': ['ADVANCED', true] },
    });
    const specialist = cand('specialist', {
      appliedRoleId: frontend.id,
      evaluation: { overall: 72, technical: 72 },
      skills: { 's-ng': ['INTERMEDIATE', true] },
    });
    const r = selectTeam([backend, frontend], [generalist, specialist]);
    const byId = Object.fromEntries(r.decisions.map((d) => [d.applicationId, d]));
    expect(byId.specialist.roleId).toBe(frontend.id);
    expect(byId.generalist.roleId).toBe(backend.id);
    expect(byId.generalist.reasons).toContain('Placed outside the applied role to fill a gap.');
    expect(r.unfilled).toEqual([]);
  });

  it('excludes candidates without an evaluation or below the interview minimum, with reasons', () => {
    const r = selectTeam(
      [backend],
      [cand('none', { evaluation: null }), cand('low', { evaluation: { overall: 30, technical: 30 } })],
    );
    expect(r.decisions.every((d) => !d.selected)).toBe(true);
    expect(r.decisions[0].reasons).toEqual(['No completed interview evaluation.']);
    expect(r.decisions[1].reasons[0]).toMatch(/below the 40 minimum/);
    expect(r.unfilled).toEqual([{ roleId: backend.id, title: 'Backend', open: 1 }]);
  });

  it('prefers covering a skill the role is missing over a slightly higher duplicate', () => {
    const twoSeats = { ...backend, seats: 2 };
    const a = cand('a', {
      evaluation: { overall: 80, technical: 80 },
      skills: { 's-nest': ['ADVANCED', true], 's-pg': ['ADVANCED', true] },
    });
    const nestOnly = cand('b', {
      evaluation: { overall: 78, technical: 78 },
      skills: { 's-nest': ['ADVANCED', true] },
    });
    const pgOnly = cand('c', { evaluation: { overall: 76, technical: 76 }, skills: { 's-pg': ['ADVANCED', true] } });
    // a takes the first seat; b and c tie on skill coverage, so b's higher interview wins…
    expect(
      selectTeam([twoSeats], [a, nestOnly, pgOnly])
        .decisions.filter((d) => d.selected)
        .map((d) => d.applicationId),
    ).toEqual(['a', 'b']);
    // …but if the first pick only covers NestJS, the PostgreSQL candidate gets the diversity bonus.
    const nestStar = cand('a', {
      evaluation: { overall: 90, technical: 90 },
      skills: { 's-nest': ['ADVANCED', true] },
    });
    const picked = selectTeam([twoSeats], [nestStar, nestOnly, pgOnly])
      .decisions.filter((d) => d.selected)
      .map((d) => d.applicationId);
    expect(picked).toEqual(['a', 'c']);
  });

  it('explains why a candidate lost a contested seat', () => {
    const strong = cand('strong', {
      evaluation: { overall: 90, technical: 90 },
      skills: { 's-nest': ['ADVANCED', true], 's-pg': ['ADVANCED', true] },
    });
    const weaker = cand('weaker', {
      evaluation: { overall: 60, technical: 60 },
      skills: { 's-nest': ['INTERMEDIATE', false], 's-pg': ['INTERMEDIATE', false] },
    });
    const r = selectTeam([backend], [strong, weaker]);
    const lost = r.decisions.find((d) => d.applicationId === 'weaker')!;
    expect(lost.selected).toBe(false);
    expect(lost.reasons[0]).toMatch(/Backend seats went to candidates with higher fit/);
  });

  it('is deterministic', () => {
    const cs = [cand('x', {}), cand('y', {}), cand('z', {})];
    expect(selectTeam([backend], cs)).toEqual(selectTeam([backend], cs));
    // Input order doesn't change who is picked.
    const first = selectTeam([backend], cs).decisions.find((d) => d.selected)!.applicationId;
    expect(selectTeam([backend], [...cs].reverse()).decisions.find((d) => d.selected)!.applicationId).toBe(first);
  });

  it('summarises coverage', () => {
    const r = selectTeam(
      [backend, frontend],
      [cand('a', { skills: { 's-nest': ['ADVANCED', true], 's-pg': ['ADVANCED', true] } })],
    );
    expect(r.summary).toBe('1 of 2 seats filled from 1 applicant (1 eligible). Open: Frontend ×1.');
  });
});
