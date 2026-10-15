import { ErrorCode } from '@studywidbuddy/shared';
import { bearer, createCourses, createHarness, Harness, registerUser, resetDatabase } from './harness';

describe('courses & enrollments (e2e)', () => {
  let h: Harness;
  let courses: { courseId: string; lessonIds: string[] }[];

  beforeAll(async () => {
    h = await createHarness();
    await resetDatabase(h.prisma);
    courses = await createCourses(h.prisma, 6);
  });
  afterAll(() => h.close());

  const enroll = (u: { token: string }, courseId: string) =>
    h.http().post('/api/v1/enrollments').set(bearer(u)).send({ courseId, level: 'BEGINNER' });

  it('lists the public catalogue without signing in', async () => {
    const res = await h.http().get('/api/v1/courses').expect(200);
    expect(res.body).toHaveLength(6);
    expect(res.body[0]).toMatchObject({ lessonCount: 2, moduleCount: 1 });
  });

  describe('four-active-course rule', () => {
    it('allows four and rejects the fifth with ACTIVE_COURSE_LIMIT_REACHED', async () => {
      const u = await registerUser(h);
      for (const c of courses.slice(0, 4)) await enroll(u, c.courseId).expect(201);
      const fifth = await enroll(u, courses[4].courseId).expect(409);
      expect(fifth.body.error.code).toBe(ErrorCode.ACTIVE_COURSE_LIMIT_REACHED);

      const learning = await h.http().get('/api/v1/me/learning').set(bearer(u)).expect(200);
      expect(learning.body.active).toHaveLength(4);
      expect(learning.body.maxActive).toBe(4);
    });

    it('frees a slot after deregistering', async () => {
      const u = await registerUser(h);
      const ids: string[] = [];
      for (const c of courses.slice(0, 4)) ids.push((await enroll(u, c.courseId).expect(201)).body.id);
      await h.http().post(`/api/v1/enrollments/${ids[0]}/deregister`).set(bearer(u)).expect(204);
      await enroll(u, courses[4].courseId).expect(201);
    });

    it('frees a slot after completing a course', async () => {
      const u = await registerUser(h);
      const ids: string[] = [];
      for (const c of courses.slice(0, 4)) ids.push((await enroll(u, c.courseId).expect(201)).body.id);

      const early = await h.http().post(`/api/v1/enrollments/${ids[0]}/complete`).set(bearer(u)).expect(409);
      expect(early.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);

      for (const lessonId of courses[0].lessonIds) {
        await h.http().post(`/api/v1/enrollments/${ids[0]}/lessons/${lessonId}/complete`).set(bearer(u)).expect(200);
      }
      const done = await h.http().post(`/api/v1/enrollments/${ids[0]}/complete`).set(bearer(u)).expect(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', progress: 100 });
      await enroll(u, courses[4].courseId).expect(201);
    });

    it('holds under concurrent requests', async () => {
      const u = await registerUser(h);
      for (const c of courses.slice(0, 3)) await enroll(u, c.courseId).expect(201);
      // Three requests race for the single remaining slot.
      const results = await Promise.all(courses.slice(3, 6).map((c) => enroll(u, c.courseId)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(results.filter((r) => r.status === 409)).toHaveLength(2);
      expect(await h.prisma.enrollment.count({ where: { userId: u.id, status: 'ACTIVE' } })).toBe(4);
    });

    it('rejects a second active enrollment in the same course', async () => {
      const u = await registerUser(h);
      await enroll(u, courses[0].courseId).expect(201);
      const dup = await enroll(u, courses[0].courseId).expect(409);
      expect(dup.body.error.code).toBe(ErrorCode.ALREADY_ENROLLED);
    });
  });

  describe('authorization', () => {
    it("hides another user's enrollment", async () => {
      const owner = await registerUser(h);
      const other = await registerUser(h);
      const id = (await enroll(owner, courses[0].courseId).expect(201)).body.id;
      await h.http().get(`/api/v1/enrollments/${id}`).set(bearer(other)).expect(404);
      await h.http().post(`/api/v1/enrollments/${id}/deregister`).set(bearer(other)).expect(404);
      await h
        .http()
        .post(`/api/v1/enrollments/${id}/lessons/${courses[0].lessonIds[0]}/complete`)
        .set(bearer(other))
        .expect(404);
    });

    it('rejects a lesson from a different course', async () => {
      const u = await registerUser(h);
      const id = (await enroll(u, courses[0].courseId).expect(201)).body.id;
      await h
        .http()
        .post(`/api/v1/enrollments/${id}/lessons/${courses[1].lessonIds[0]}/complete`)
        .set(bearer(u))
        .expect(404);
    });
  });

  it('derives stats and recommendations from stored progress', async () => {
    const u = await registerUser(h);
    const fresh = await h.http().get('/api/v1/me/learning/stats').set(bearer(u)).expect(200);
    expect(fresh.body).toMatchObject({ streakDays: 0, thisMonth: { lessonsCompleted: 0 }, recent: [] });
    expect(fresh.body.days).toHaveLength(35);

    const id = (await enroll(u, courses[2].courseId).expect(201)).body.id;
    await h
      .http()
      .post(`/api/v1/enrollments/${id}/lessons/${courses[2].lessonIds[0]}/complete`)
      .set(bearer(u))
      .expect(200);

    const after = await h.http().get('/api/v1/me/learning/stats').set(bearer(u)).expect(200);
    expect(after.body.streakDays).toBe(1);
    expect(after.body.thisMonth).toMatchObject({ lessonsCompleted: 1, minutesLearned: 1, coursesStarted: 1 });
    expect(after.body.days.at(-1).count).toBe(1);
    expect(after.body.recent[0]).toMatchObject({ kind: 'LESSON_COMPLETED', courseTitle: 'Course 3', detail: '1.1 L1' });

    const recs = await h.http().get('/api/v1/me/learning/recommendations').set(bearer(u)).expect(200);
    expect(recs.body.map((r: { course: { id: string } }) => r.course.id)).not.toContain(courses[2].courseId);
    expect(recs.body[0].reasons.length).toBeGreaterThan(0);
  });

  it('records course skills as DEMONSTRATED on completion, separate from claimed ones', async () => {
    const skill = await h.prisma.skill.create({ data: { slug: 'demo-skill', name: 'Demo Skill', category: 'OTHER' } });
    await h.prisma.courseSkill.create({ data: { courseId: courses[5].courseId, skillId: skill.id } });
    const u = await registerUser(h);
    await h.http().put(`/api/v1/me/skills/${skill.id}`).set(bearer(u)).send({ level: 'ADVANCED' }).expect(200);
    const id = (await enroll(u, courses[5].courseId).expect(201)).body.id;
    for (const l of courses[5].lessonIds)
      await h.http().post(`/api/v1/enrollments/${id}/lessons/${l}/complete`).set(bearer(u));
    await h.http().post(`/api/v1/enrollments/${id}/complete`).set(bearer(u)).expect(200);

    const skills = await h.http().get('/api/v1/me/skills').set(bearer(u)).expect(200);
    expect(skills.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ skillId: skill.id, source: 'CLAIMED', level: 'ADVANCED' }),
        expect.objectContaining({ skillId: skill.id, source: 'DEMONSTRATED', level: 'BEGINNER' }),
      ]),
    );
  });
});
