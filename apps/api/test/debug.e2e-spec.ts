import { DEBUG_TEST_FILE, ErrorCode } from '@studywidbuddy/shared';
import { GeminiChat } from '../src/ai/gemini-chat';
import { findExercise } from '../src/debug/catalogue';
import { FakeGeminiChat } from './fakes/fake-gemini-chat';
import { bearer, createHarness, type Harness, registerUser, resetDatabase, type TestUser, uniq } from './harness';

describe('Debug exercises and the activity graph (e2e)', () => {
  let h: Harness;
  const gemini = new FakeGeminiChat();
  let ana: TestUser;
  let ben: TestUser;
  let anaName: string;
  const today = () => new Date().toISOString().slice(0, 10);
  const api = (u: TestUser) => ({
    get: (path: string) => h.http().get(`/api/v1${path}`).set(bearer(u)),
    post: (path: string, body: object = {}) => h.http().post(`/api/v1${path}`).set(bearer(u)).send(body),
  });

  beforeAll(async () => {
    h = await createHarness({ overrides: [[GeminiChat, gemini]] });
    await resetDatabase(h.prisma);
    [ana, ben] = await Promise.all([registerUser(h), registerUser(h)]);
    anaName = (await api(ana).get('/me/profile').expect(200)).body.username;
  });
  afterAll(() => h.close());

  it('lists 50+ exercises with filters and progress', async () => {
    const all = (await api(ana).get('/debug/exercises').expect(200)).body;
    expect(all.items.length).toBeGreaterThanOrEqual(50);
    expect(all.progress).toMatchObject({ total: all.items.length, solved: 0 });
    expect(all.items[0]).toMatchObject({ slug: 'cart-total', level: 'EASY', status: 'NEW', bugCount: 3 });

    const hard = (await api(ana).get('/debug/exercises?level=HARD').expect(200)).body.items;
    expect(hard.length).toBeGreaterThan(0);
    expect(hard.every((e: { level: string; bugCount: number }) => e.level === 'HARD' && e.bugCount >= 4)).toBe(true);
    const security = (await api(ana).get('/debug/exercises?category=SECURITY').expect(200)).body.items;
    expect(security.every((e: { categories: string[] }) => e.categories.includes('SECURITY'))).toBe(true);
    expect((await api(ana).get('/debug/exercises?q=calculator').expect(200)).body.items).toHaveLength(1);
    await api(ana).get('/debug/exercises?level=EXPERT').expect(400);
  });

  it('opens an exercise without revealing the solution; the review needs a solve', async () => {
    const ex = (await api(ana).get('/debug/exercises/cart-total').expect(200)).body;
    expect(ex.files.map((f: { path: string; readOnly: boolean }) => [f.path, f.readOnly])).toEqual([
      ['cart.js', false],
      [DEBUG_TEST_FILE, true],
    ]);
    expect(JSON.stringify(ex)).not.toContain('i < items.length');
    expect(ex.attempt).toBeNull();

    const started = (await api(ana).post('/debug/exercises/cart-total/start').expect(200)).body;
    expect(started).toMatchObject({ status: 'IN_PROGRESS', runs: 0, solvedAt: null });
    const review = await api(ana).get('/debug/exercises/cart-total/review').expect(409);
    expect(review.body.error.code).toBe(ErrorCode.CONFLICT);
    await api(ana).get('/debug/exercises/no-such-thing').expect(404);
  });

  it('records runs; the first green run solves it with the time taken and the review', async () => {
    const correct = findExercise('cart-total')!.files['cart.js'];
    const red = await api(ana)
      .post('/debug/exercises/cart-total/runs', { passed: 2, failed: 2, files: [{ path: 'cart.js', content: 'x' }] })
      .expect(200);
    expect(red.body).toMatchObject({ attempt: { runs: 1, status: 'IN_PROGRESS' }, review: null });

    // Pretend the learner opened it ten minutes ago.
    await h.prisma.debugAttempt.updateMany({
      where: { userId: ana.id, exerciseSlug: 'cart-total' },
      data: { startedAt: new Date(Date.now() - 600_000) },
    });
    const files = [
      { path: 'cart.js', content: correct },
      { path: DEBUG_TEST_FILE, content: 'tampered tests' },
      { path: '../evil.js', content: 'nope' },
    ];
    const green = (await api(ana).post('/debug/exercises/cart-total/runs', { passed: 4, failed: 0, files }).expect(200))
      .body;
    expect(green.attempt).toMatchObject({ status: 'SOLVED', runs: 2, solutionViewed: false });
    expect(green.attempt.durationSec).toBeGreaterThanOrEqual(599);
    expect(green.review.bugs).toHaveLength(3);
    expect(green.review.bugs[0]).toMatchObject({ file: 'cart.js', line: 3, category: 'OFF_BY_ONE' });
    expect(green.review.yourFiles).toEqual([{ path: 'cart.js', content: correct }]);

    // Later runs never move the solve time.
    const again = (await api(ana).post('/debug/exercises/cart-total/runs', { passed: 4, failed: 0, files }).expect(200))
      .body;
    expect(again.attempt.solvedAt).toBe(green.attempt.solvedAt);
    expect(again.attempt.runs).toBe(3);
    expect((await api(ana).get('/debug/exercises/cart-total/review').expect(200)).body.bugs).toHaveLength(3);
    expect(
      (await api(ana).get('/debug/exercises?status=SOLVED').expect(200)).body.items.map(
        (e: { slug: string }) => e.slug,
      ),
    ).toEqual(['cart-total']);
  });

  it('the assistant guides in hint mode and gives fixes only with the solution toggle', async () => {
    const files = [{ path: 'grades.js', content: 'function average() {}' }];
    const hint = await api(ana)
      .post('/debug/exercises/grade-report/assistant', { message: 'Explain average()', files, solution: false })
      .expect(200);
    expect(hint.body.reply).toContain('loop condition');
    const hintReq = gemini.requests.at(-1)!;
    expect(hintReq).toMatchObject({ purpose: 'debug.assistant', userId: ana.id });
    expect(hintReq.system).toContain('HINT MODE');
    expect(hintReq.system).not.toContain('known_bugs');

    await api(ana)
      .post('/debug/exercises/grade-report/assistant', { message: 'Show me the fix', files, solution: true })
      .expect(200);
    expect(gemini.requests.at(-1)!.system).toContain('<known_bugs>');
    const view = (await api(ana).get('/debug/exercises/grade-report').expect(200)).body;
    expect(view.attempt.solutionViewed).toBe(true);

    gemini.failNext = true;
    const busy = await api(ana)
      .post('/debug/exercises/grade-report/assistant', { message: 'Hello', files, solution: false })
      .expect(503);
    expect(busy.body.error.code).toBe(ErrorCode.AI_UNAVAILABLE);
    gemini.configured = false;
    await api(ana)
      .post('/debug/exercises/grade-report/assistant', { message: 'Hi', files, solution: false })
      .expect(503);
    gemini.configured = true;
    await api(ana).post('/debug/exercises/grade-report/assistant', { files, solution: false }).expect(400);
  });

  it('study time: one heartbeat a minute, only on your own enrollment', async () => {
    const course = await h.prisma.course.create({
      data: {
        slug: uniq('c-'),
        title: 'RxJS in Depth',
        summary: 's',
        description: 'd',
        category: 'FRONTEND',
        level: 'BEGINNER',
        estimatedHours: 5,
        publishedAt: new Date(),
      },
    });
    const enrollment = await h.prisma.enrollment.create({
      data: { userId: ana.id, courseId: course.id, level: 'BEGINNER' },
    });
    await api(ben).post(`/enrollments/${enrollment.id}/study-time`).expect(404);
    await api(ana).post(`/enrollments/${enrollment.id}/study-time`).expect(204);
    await api(ana).post(`/enrollments/${enrollment.id}/study-time`).expect(204); // a second tab, seconds later
    const row = await h.prisma.studyTime.findFirstOrThrow({ where: { enrollmentId: enrollment.id } });
    expect(row.seconds).toBe(60);

    // 29 minutes isn't a study day yet; 31 is.
    await h.prisma.studyTime.updateMany({ where: { enrollmentId: enrollment.id }, data: { seconds: 29 * 60 } });
    let cal = (await api(ana).get(`/profiles/${anaName}/contributions?kinds=STUDY`).expect(200)).body;
    expect(cal.totals.STUDY).toBe(0);
    await h.prisma.studyTime.updateMany({ where: { enrollmentId: enrollment.id }, data: { seconds: 31 * 60 } });
    cal = (await api(ana).get(`/profiles/${anaName}/contributions?kinds=STUDY`).expect(200)).body;
    expect(cal.totals.STUDY).toBe(1);
  });

  it('the profile graph shows real work per day, with filters, day detail and privacy', async () => {
    const project = await h.prisma.project.create({
      data: {
        slug: uniq('p-'),
        title: 'Campus Hub',
        summary: 's',
        description: 'd',
        problem: 'p',
        difficulty: 'BEGINNER',
        status: 'IN_PROGRESS',
        durationWeeks: 4,
        teamSize: 2,
        roles: { create: [{ key: 'backend', title: 'Backend Developer', description: 'APIs', seats: 2 }] },
      },
      include: { roles: true },
    });
    await h.prisma.task.create({
      data: {
        projectId: project.id,
        number: 7,
        title: 'RSVP endpoint',
        status: 'DONE',
        completedAt: new Date(),
        assigneeId: ana.id,
      },
    });
    await h.prisma.projectActivity.create({
      data: { projectId: project.id, type: 'CODE_PUSHED', actorUserId: ana.id, summary: 'pushed 2 commits to main' },
    });
    const application = await h.prisma.projectApplication.create({
      data: {
        projectId: project.id,
        roleId: project.roles[0].id,
        userId: ana.id,
        motivation: 'm'.repeat(50),
        availabilityHoursPerWeek: 5,
        status: 'UNDER_REVIEW',
      },
    });
    await h.prisma.interviewSession.create({
      data: { applicationId: application.id, status: 'SUBMITTED', submittedAt: new Date() },
    });

    const cal = (await api(ana).get(`/profiles/${anaName}/contributions`).expect(200)).body;
    expect(cal.days.length).toBeGreaterThanOrEqual(365);
    expect(cal.to).toBe(today());
    const day = cal.days.at(-1);
    expect(day.kinds).toEqual(['DEBUG', 'STUDY', 'TASK', 'PROJECT', 'INTERVIEW']);
    expect(day.count).toBe(5);
    expect(cal).toMatchObject({ activeDays: 1, streak: 1 });

    const onlyDebug = (await api(ana).get(`/profiles/${anaName}/contributions?kinds=DEBUG`).expect(200)).body;
    expect(onlyDebug.days.at(-1)).toMatchObject({ count: 1, kinds: ['DEBUG'] });

    const detail = (await api(ana).get(`/profiles/${anaName}/contributions/${today()}`).expect(200)).body;
    const titles = detail.items.map((i: { title: string }) => i.title);
    expect(titles).toEqual([
      'Fixed “Shopping cart total”',
      'Studied RxJS in Depth',
      'Completed TASK-7: RSVP endpoint',
      'Worked on Campus Hub',
      'Took an AI interview',
    ]);
    expect(detail.items[0]).toMatchObject({
      kind: 'DEBUG',
      link: '/debug/cart-total',
      detail: 'Easy · 3 bugs · 10 min',
    });
    expect(detail.items[4].link).toBe(`/applications/${application.id}`);

    // Others see the graph of a public profile, without private links.
    const seen = (await api(ben).get(`/profiles/${anaName}/contributions/${today()}`).expect(200)).body;
    expect(seen.items[4].link).toBeNull();
    const stats = (await api(ben).get(`/profiles/${anaName}/debugging`).expect(200)).body;
    expect(stats).toMatchObject({
      solved: 1,
      byLevel: { EASY: 1, INTERMEDIATE: 0, HARD: 0 },
      medianSolveSec: expect.any(Number),
    });
    expect(stats.recent[0]).toMatchObject({ slug: 'cart-total', title: 'Shopping cart total' });

    // A private profile's activity is hidden like the profile itself.
    await h.prisma.profile.update({ where: { userId: ana.id }, data: { visibility: 'PRIVATE' } });
    await api(ben).get(`/profiles/${anaName}/contributions`).expect(404);
    await api(ben).get(`/profiles/${anaName}/debugging`).expect(404);
    await api(ana).get(`/profiles/${anaName}/contributions`).expect(200);
    await api(ana).get(`/profiles/${anaName}/contributions/yesterday`).expect(400);
  });
});
