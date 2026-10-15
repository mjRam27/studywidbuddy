import { ErrorCode } from '@studywidbuddy/shared';
import { bearer, createHarness, type Harness, registerUser, resetDatabase, type TestUser, uniq } from './harness';

describe('team selection (e2e)', () => {
  let h: Harness;
  let admin: TestUser;

  beforeAll(async () => {
    h = await createHarness();
    await resetDatabase(h.prisma);
    admin = await registerUser(h, { verified: true });
    await h.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    // Role is a JWT claim, so sign in again to get an admin token.
    const login = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email: admin.email, password: admin.password })
      .expect(200);
    admin.token = login.body.accessToken;
  });
  afterAll(() => h.close());

  /** A project with 1 backend + 1 frontend seat, each needing one skill. */
  async function project() {
    const nest = await h.prisma.skill.create({ data: { slug: uniq('nest-'), name: 'NestJS', category: 'BACKEND' } });
    const ng = await h.prisma.skill.create({ data: { slug: uniq('ng-'), name: 'Angular', category: 'FRONTEND' } });
    const p = await h.prisma.project.create({
      data: {
        slug: uniq('p-'),
        title: 'Team Project',
        summary: 's',
        description: 'd',
        problem: 'p',
        difficulty: 'BEGINNER',
        status: 'OPEN',
        durationWeeks: 4,
        teamSize: 2,
        roles: {
          create: [
            {
              key: 'backend',
              title: 'Backend Developer',
              description: 'APIs',
              seats: 1,
              requiredSkills: { create: [{ skillId: nest.id, minLevel: 'INTERMEDIATE' }] },
            },
            {
              key: 'frontend',
              title: 'Frontend Developer',
              description: 'UI',
              seats: 1,
              requiredSkills: { create: [{ skillId: ng.id, minLevel: 'INTERMEDIATE' }] },
            },
          ],
        },
      },
      include: { roles: true },
    });
    return {
      p,
      nest,
      ng,
      backend: p.roles.find((r) => r.key === 'backend')!,
      frontend: p.roles.find((r) => r.key === 'frontend')!,
    };
  }

  /** An application that has been interviewed and evaluated (fixtures, not the AI path). */
  async function evaluatedCandidate(projectId: string, roleId: string, overall: number, skillId?: string) {
    const u = await registerUser(h, { verified: true });
    if (skillId)
      await h.prisma.userSkill.create({ data: { userId: u.id, skillId, source: 'DEMONSTRATED', level: 'ADVANCED' } });
    const app = await h.prisma.projectApplication.create({
      data: {
        projectId,
        roleId,
        userId: u.id,
        motivation: 'm'.repeat(50),
        availabilityHoursPerWeek: 10,
        status: 'UNDER_REVIEW',
      },
    });
    await h.prisma.interviewSession.create({
      data: {
        applicationId: app.id,
        status: 'EVALUATED',
        evaluation: {
          create: {
            technicalScore: overall,
            problemSolvingScore: overall,
            communicationScore: overall,
            projectFitScore: overall,
            overallScore: overall,
            strengths: ['x'],
            areasToImprove: ['y'],
            summary: 'summary text here',
            aiModel: 'fixture',
          },
        },
      },
    });
    return { u, applicationId: app.id };
  }

  it('is admin-only', async () => {
    const { p } = await project();
    const user = await registerUser(h);
    await h.http().post(`/api/v1/admin/projects/${p.id}/selection-runs`).set(bearer(user)).expect(403);
  });

  it('proposes, applies, invites and lets the candidate accept', async () => {
    const { p, nest, ng, backend, frontend } = await project();
    const be = await evaluatedCandidate(p.id, backend.id, 82, nest.id);
    const fe = await evaluatedCandidate(p.id, frontend.id, 74, ng.id);
    const extraBe = await evaluatedCandidate(p.id, backend.id, 60, nest.id);
    const lowScore = await evaluatedCandidate(p.id, backend.id, 25, nest.id);

    const proposed = await h
      .http()
      .post(`/api/v1/admin/projects/${p.id}/selection-runs`)
      .set(bearer(admin))
      .expect(201);
    expect(proposed.body.status).toBe('PROPOSED');
    expect(proposed.body.summary).toMatch(/2 of 2 seats filled from 4 applicants \(3 eligible\)/);
    const decision = (appId: string) =>
      proposed.body.candidates.find((c: { applicationId: string }) => c.applicationId === appId).decision;
    expect(decision(be.applicationId)).toMatchObject({ selected: true, role: { id: backend.id } });
    expect(decision(fe.applicationId)).toMatchObject({ selected: true, role: { id: frontend.id } });
    expect(decision(extraBe.applicationId).selected).toBe(false);
    expect(decision(extraBe.applicationId).reasons.join(' ')).toMatch(/seats went to candidates with higher fit/);
    expect(decision(lowScore.applicationId).reasons[0]).toMatch(/below the 40 minimum/);

    // A proposal changes nothing for candidates.
    const before = await h.http().get(`/api/v1/applications/${be.applicationId}`).set(bearer(be.u)).expect(200);
    expect(before.body.status).toBe('UNDER_REVIEW');

    const applied = await h
      .http()
      .post(`/api/v1/admin/selection-runs/${proposed.body.id}/apply`)
      .set(bearer(admin))
      .expect(200);
    expect(applied.body.status).toBe('APPLIED');
    const again = await h
      .http()
      .post(`/api/v1/admin/selection-runs/${proposed.body.id}/apply`)
      .set(bearer(admin))
      .expect(409);
    expect(again.body.error.code).toBe(ErrorCode.SELECTION_NOT_PROPOSED);

    const status = async (c: { u: TestUser; applicationId: string }) =>
      (await h.http().get(`/api/v1/applications/${c.applicationId}`).set(bearer(c.u)).expect(200)).body.status;
    expect(await status(be)).toBe('SELECTED');
    expect(await status(fe)).toBe('SELECTED');
    expect(await status(extraBe)).toBe('REJECTED');
    expect(await status(lowScore)).toBe('REJECTED');

    const detail = await h.http().get(`/api/v1/projects/${p.slug}`).set(bearer(be.u)).expect(200);
    expect(detail.body.status).toBe('IN_PROGRESS');
    expect(detail.body.roles.every((r: { open: number }) => r.open === 0)).toBe(true);

    const mine = await h.http().get('/api/v1/me/teams').set(bearer(be.u)).expect(200);
    expect(mine.body).toEqual([
      expect.objectContaining({ status: 'INVITED', role: { id: backend.id, title: 'Backend Developer' } }),
    ]);
    const memberId = mine.body[0].memberId;

    await h.http().post(`/api/v1/team-members/${memberId}/accept`).set(bearer(fe.u)).expect(404);
    const accepted = await h.http().post(`/api/v1/team-members/${memberId}/accept`).set(bearer(be.u)).expect(200);
    expect(accepted.body.status).toBe('ACTIVE');
    await h.http().post(`/api/v1/team-members/${memberId}/decline`).set(bearer(be.u)).expect(409);

    const team = await h.http().get(`/api/v1/projects/${p.slug}/team`).set(bearer(extraBe.u)).expect(200);
    expect(team.body.members.map((m: { status: string }) => m.status).sort()).toEqual(['ACTIVE', 'INVITED']);

    // The project is no longer recruiting, so no further selection runs.
    await h.http().post(`/api/v1/admin/projects/${p.id}/selection-runs`).set(bearer(admin)).expect(409);
  });

  it('replaces an older proposal and skips candidates who withdrew meanwhile', async () => {
    const { p, nest, backend } = await project();
    const a = await evaluatedCandidate(p.id, backend.id, 80, nest.id);
    const first = await h.http().post(`/api/v1/admin/projects/${p.id}/selection-runs`).set(bearer(admin)).expect(201);
    const second = await h.http().post(`/api/v1/admin/projects/${p.id}/selection-runs`).set(bearer(admin)).expect(201);
    await h.http().post(`/api/v1/admin/selection-runs/${first.body.id}/apply`).set(bearer(admin)).expect(409);

    await h.http().post(`/api/v1/applications/${a.applicationId}/withdraw`).set(bearer(a.u)).expect(200);
    await h.http().post(`/api/v1/admin/selection-runs/${second.body.id}/apply`).set(bearer(admin)).expect(200);
    expect(await h.prisma.teamMember.count({ where: { applicationId: a.applicationId } })).toBe(0);
  });
});
