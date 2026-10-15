import { ErrorCode } from '@studywidbuddy/shared';
import { MeetingsService } from '../src/pm/meetings.service';
import {
  applyWith,
  bearer,
  createCourses,
  createHarness,
  createProject,
  type Harness,
  registerUser,
  waitFor,
} from './harness';

describe('AI interview without a provider (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
  });
  afterAll(() => h.close());

  it('says AI is not configured instead of faking an interview', async () => {
    const viewer = await registerUser(h);
    const status = await h.http().get('/api/v1/ai/status').set(bearer(viewer)).expect(200);
    expect(status.body).toEqual({ configured: false, provider: 'none', model: null, fastModel: null });

    const u = await registerUser(h, { verified: true });
    const project = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    const app = await applyWith(h, u, project.id, {
      roleId: project.roles[0].id,
      motivation: 'x'.repeat(50),
      availabilityHoursPerWeek: 5,
    }).expect(201);
    // Without an AI, the CV can't be screened: it says so and offers a retry, never a fake score.
    const after = await waitFor(async () => {
      const r = await h.http().get(`/api/v1/applications/${app.body.id}`).set(bearer(u));
      return r.body.screening.status === 'FAILED' ? r.body : false;
    });
    expect(after.status).toBe('SUBMITTED');
    expect(after.screening.atsScore).toBeNull();
  });

  it('says the AI Buddy, voice checks, AI PM and meetings are unavailable, and schedules nothing', async () => {
    const u = await registerUser(h);
    const [course] = await createCourses(h.prisma, 1);
    const e = await h
      .http()
      .post('/api/v1/enrollments')
      .set(bearer(u))
      .send({ courseId: course.courseId, level: 'BEGINNER' })
      .expect(201);
    for (const id of course.lessonIds) {
      await h.http().post(`/api/v1/enrollments/${e.body.id}/lessons/${id}/complete`).set(bearer(u)).expect(200);
    }
    const tutor = await h
      .http()
      .post(`/api/v1/enrollments/${e.body.id}/tutor`)
      .set(bearer(u))
      .send({ message: 'Hello?' })
      .expect(503);
    expect(tutor.body.error.code).toBe(ErrorCode.AI_NOT_CONFIGURED);
    const check = await h.http().post(`/api/v1/enrollments/${e.body.id}/assessments`).set(bearer(u)).expect(503);
    expect(check.body.error.code).toBe(ErrorCode.AI_NOT_CONFIGURED);

    const project = await createProject(h.prisma, { status: 'IN_PROGRESS' });
    await h.prisma.project.update({
      where: { id: project.id },
      data: { startsAt: new Date(Date.now() - 5 * 86_400_000) },
    });
    const team = await h.prisma.team.create({ data: { projectId: project.id } });
    const app = await h.prisma.projectApplication.create({
      data: {
        projectId: project.id,
        roleId: project.roles[0].id,
        userId: u.id,
        motivation: 'm'.repeat(50),
        availabilityHoursPerWeek: 10,
        status: 'SELECTED',
      },
    });
    await h.prisma.teamMember.create({
      data: { teamId: team.id, userId: u.id, roleId: project.roles[0].id, applicationId: app.id, status: 'ACTIVE' },
    });
    const pm = await h.http().get(`/api/v1/projects/${project.slug}/pm`).set(bearer(u)).expect(200);
    expect(pm.body).toMatchObject({ aiConfigured: false, openMeeting: null, meetings: [] });
    const run = await h.http().post(`/api/v1/projects/${project.slug}/pm/runs`).set(bearer(u)).send({}).expect(503);
    expect(run.body.error.code).toBe(ErrorCode.AI_NOT_CONFIGURED);
    await h
      .http()
      .post(`/api/v1/projects/${project.slug}/meetings`)
      .set(bearer(u))
      .send({ kind: 'CHECK_IN' })
      .expect(503);
    // The meeting is due, but without an AI there is nothing to run: no empty meetings appear.
    expect((await h.app.get(MeetingsService).tick()).opened).toBe(0);
  });
});
