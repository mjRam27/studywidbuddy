import { ErrorCode } from '@studywidbuddy/shared';
import { AiError } from '../src/ai/ai-provider';
import { DEFAULT_CLOSING } from '../src/interviews/interview-flow';
import { ScriptedAiProvider } from './fakes/scripted-ai.provider';
import {
  applyWith,
  bearer,
  createHarness,
  createProject,
  type Harness,
  registerUser,
  resetDatabase,
  type TestUser,
  uniq,
  waitFor,
} from './harness';

const cvScreen = (score: number, extra: Record<string, unknown> = {}) => ({
  skillsScore: score,
  experienceScore: score,
  keywordsScore: score,
  projectsScore: score,
  clarityScore: score,
  matchedSkills: ['NestJS'],
  missingSkills: ['PostgreSQL', 'Kubernetes (not a role skill)'],
  candidateSummary: 'Student who built two NestJS APIs and a delivery tracker side project.',
  feedback: 'Solid backend projects. Add measurable outcomes and your database work.',
  ...extra,
});

const plan = () => ({
  opening: 'Hi, I am the StudywidBuddy AI interviewer for the Delivery role. Please introduce yourself.',
  topics: [
    {
      kind: 'TECHNICAL',
      focus: 'NestJS · modules',
      question: 'Walk me through how you would split the API into modules.',
    },
    { kind: 'TECHNICAL', focus: 'PostgreSQL · indexes', question: 'Which index would you add for orders by customer?' },
    { kind: 'PROBLEM_SOLVING', focus: 'Dispatch', question: 'Two drivers accept the same order. What happens?' },
    { kind: 'PROJECT_FIT', focus: 'Fit', question: 'What will you own in your ten hours a week?' },
  ],
});

const evaluation = (score: number) => ({
  technicalScore: score,
  problemSolvingScore: score,
  communicationScore: score,
  projectFitScore: score,
  strengths: ['Clear explanation of module boundaries'],
  areasToImprove: ['Go deeper on indexing trade-offs'],
  recommendedRoleKey: null,
  summary: 'You explained your design choices clearly and reasoned well about concurrency.',
});

const unavailable = () => new AiError('UNAVAILABLE', 'busy');

describe('CV screening + voice interview (e2e)', () => {
  let h: Harness;
  const ai = new ScriptedAiProvider();
  let project: Awaited<ReturnType<typeof createProject>>;
  let backendRoleId: string;
  let admin: TestUser;

  beforeAll(async () => {
    h = await createHarness({ ai });
    await resetDatabase(h.prisma);
    project = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    backendRoleId = project.roles.find((r) => r.key === 'backend')!.id;
    // Give the role required skills, and the catalogue a course that teaches one of them.
    const pg = await h.prisma.skill.create({ data: { slug: uniq('pg-'), name: 'PostgreSQL', category: 'BACKEND' } });
    const nest = await h.prisma.skill.create({ data: { slug: uniq('nest-'), name: 'NestJS', category: 'BACKEND' } });
    await h.prisma.projectRequiredSkill.createMany({
      data: [
        { roleId: backendRoleId, skillId: pg.id, minLevel: 'INTERMEDIATE' },
        { roleId: backendRoleId, skillId: nest.id, minLevel: 'INTERMEDIATE' },
      ],
    });
    await h.prisma.course.create({
      data: {
        slug: uniq('pg-course-'),
        title: 'PostgreSQL for Developers',
        summary: 's',
        description: 'd',
        category: 'BACKEND',
        level: 'BEGINNER',
        estimatedHours: 6,
        publishedAt: new Date(),
        skills: { create: [{ skillId: pg.id }] },
      },
    });
    admin = await registerUser(h, { verified: true });
    await h.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    admin.token = (
      await h.http().post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }).expect(200)
    ).body.accessToken;
  });
  afterAll(() => h.close());

  const app = (u: TestUser, id: string) => h.http().get(`/api/v1/applications/${id}`).set(bearer(u));
  const until = (u: TestUser, id: string, check: (b: Record<string, unknown>) => boolean) =>
    waitFor(async () => {
      const r = await app(u, id);
      return check(r.body) ? r.body : false;
    });

  async function applyAndScreen(score: number) {
    const u = await registerUser(h, { verified: true });
    ai.push(cvScreen(score));
    const res = await applyWith(h, u, project.id, {
      roleId: backendRoleId,
      motivation: 'I want to practise building realtime backends with a real team and deadlines.',
      availabilityHoursPerWeek: 10,
    }).expect(201);
    const screened = await until(u, res.body.id, (b) => (b.screening as { status: string }).status !== 'PENDING');
    return { u, applicationId: res.body.id as string, screened };
  }

  /** Books "now", joins, and answers every question; turns fall back to the plan (cheapest path). */
  async function quickInterview(u: TestUser, applicationId: string, score: number) {
    const v = (await app(u, applicationId)).body;
    const id = v.interview.id as string;
    await h.http().post(`/api/v1/interviews/${id}/schedule`).set(bearer(u)).send({ at: 'now' }).expect(200);
    ai.push(plan());
    let live = (await h.http().post(`/api/v1/interviews/${id}/start`).set(bearer(u)).expect(200)).body;
    let current = live.current;
    ai.push(unavailable(), unavailable(), unavailable(), unavailable(), evaluation(score));
    for (;;) {
      const r = await h
        .http()
        .post(`/api/v1/interviews/${id}/turns`)
        .set(bearer(u))
        .send({ position: current.position, answer: `Spoken answer to ${current.focus}` })
        .expect(200);
      if (r.body.done) break;
      current = r.body.next;
    }
    live = await waitFor(async () => {
      const r = await h.http().get(`/api/v1/interviews/${id}`).set(bearer(u));
      return r.body.status === 'EVALUATED' ? r.body : false;
    });
    return { id, live };
  }

  it('screens the CV, books "now", runs a real conversation, and seats the candidate', async () => {
    const { u, applicationId, screened } = await applyAndScreen(90);
    // Only the role's real required skills survive in the lists.
    expect(screened).toMatchObject({
      status: 'INTERVIEW_PENDING',
      screening: { status: 'DONE', atsScore: 90, matchedSkills: ['NestJS'], missingSkills: ['PostgreSQL'] },
      interview: { status: 'AWAITING_SCHEDULE', scheduledFor: null },
    });
    const screenCall = ai.calls.find((c) => c.purpose === 'cv.screen')!;
    expect(JSON.stringify(screenCall.messages[0].content)).toContain('"type":"document"');
    expect(h.mailer.sent.at(-1)!.subject).toContain('invited to a voice interview');

    const id = (screened.interview as { id: string }).id;
    const slots = (await h.http().get(`/api/v1/interviews/${id}/slots`).set(bearer(u)).expect(200)).body;
    expect(slots.now).toBe(true);
    expect(slots.slots.length).toBeGreaterThan(40);
    const bad = await h
      .http()
      .post(`/api/v1/interviews/${id}/schedule`)
      .set(bearer(u))
      .send({ at: '2026-01-01T03:17:00.000Z' })
      .expect(422);
    expect(bad.body.error.code).toBe(ErrorCode.INTERVIEW_NOT_SCHEDULABLE);

    // A slot later on: booked, but not joinable yet.
    const later = slots.slots.at(-1);
    const booked = await h
      .http()
      .post(`/api/v1/interviews/${id}/schedule`)
      .set(bearer(u))
      .send({ at: later })
      .expect(200);
    expect(booked.body).toMatchObject({ status: 'SCHEDULED', scheduledFor: later, canJoin: false });
    const early = await h.http().post(`/api/v1/interviews/${id}/start`).set(bearer(u)).expect(409);
    expect(early.body.error.code).toBe(ErrorCode.INTERVIEW_NOT_JOINABLE);

    // Rebook to start right away.
    const now = await h.http().post(`/api/v1/interviews/${id}/schedule`).set(bearer(u)).send({ at: 'now' }).expect(200);
    expect(now.body.canJoin).toBe(true);

    ai.push(plan());
    const live = (await h.http().post(`/api/v1/interviews/${id}/start`).set(bearer(u)).expect(200)).body;
    expect(live).toMatchObject({ status: 'LIVE', current: { position: 1, kind: 'INTRODUCTION' } });
    expect(live.current.prompt).toContain('introduce yourself');
    expect((await app(u, applicationId)).body.status).toBe('INTERVIEW_IN_PROGRESS');

    const say = (position: number, answer: string, extra: Record<string, unknown> = {}) =>
      h
        .http()
        .post(`/api/v1/interviews/${id}/turns`)
        .set(bearer(u))
        .send({ position, answer, ...extra });

    // 1: introduction → model moves to topic 0 in its own words.
    ai.push({
      action: 'NEXT_TOPIC',
      topicIndex: 0,
      say: 'Nice to meet you. Tell me how you would split the API into modules.',
    });
    let r = (
      await say(1, 'Hi, I am a final-year student who loves backend work.', { thinkMs: 1200, speakMs: 9000 }).expect(
        200,
      )
    ).body;
    expect(r.next).toMatchObject({ position: 2, kind: 'TECHNICAL', focus: 'NestJS · modules' });
    expect(ai.calls.at(-1)!.tier).toBe('fast');
    // The same answer can't be sent twice.
    await say(1, 'duplicate').expect(409);

    // 2: a follow-up is allowed…
    ai.push({ action: 'FOLLOW_UP', topicIndex: null, say: 'Why put auth in its own module?' });
    r = (await say(2, 'Orders, dispatch and auth modules.').expect(200)).body;
    expect(r.next).toMatchObject({ position: 3, kind: 'FOLLOW_UP', prompt: 'Why put auth in its own module?' });

    // 3: …but not two in a row: the planned topic 1 is asked instead.
    ai.push({ action: 'FOLLOW_UP', topicIndex: null, say: 'And then?' });
    r = (await say(3, 'So other modules can depend on it.', { focusLost: 2 }).expect(200)).body;
    expect(r.next).toMatchObject({ position: 4, prompt: 'Which index would you add for orders by customer?' });

    // 4: the AI is unavailable mid-call: the plan carries on (topic 2).
    ai.push(unavailable());
    r = (await say(4, 'A composite index on customer id and created at.').expect(200)).body;
    expect(r.next).toMatchObject({ position: 5, kind: 'PROBLEM_SOLVING' });

    // 5: the model tries to close early; topic 3 remains, so it's asked.
    ai.push({ action: 'CLOSE', topicIndex: null, say: 'Bye!' });
    r = (await say(5, 'A conditional update so only one wins.').expect(200)).body;
    expect(r.next).toMatchObject({ position: 6, kind: 'PROJECT_FIT' });

    // 6: all topics covered → the call closes (no AI call needed) and evaluation starts.
    const callsBefore = ai.calls.length;
    ai.push(evaluation(80));
    r = (await say(6, 'I will own the dispatch service.').expect(200)).body;
    expect(r).toEqual({ next: null, closingRemark: DEFAULT_CLOSING, done: true });
    expect(ai.calls.length).toBeGreaterThanOrEqual(callsBefore);

    const done = await waitFor(async () => {
      const x = await h.http().get(`/api/v1/interviews/${id}`).set(bearer(u));
      return x.body.status === 'EVALUATED' ? x.body : false;
    });
    expect(done.evaluation.overallScore).toBe(80);
    expect(done.turns).toHaveLength(6);
    expect(done.integrity).toBeNull();
    const evalCall = ai.calls.find((c) => c.purpose === 'interview.evaluation')!;
    expect(evalCall.messages[0].content).toContain('source="speech-to-text"');

    const final = await until(u, applicationId, (b) => b.status === 'SELECTED');
    expect(final.seat).toEqual({ projectSlug: project.slug, roleTitle: 'Backend Developer' });
    const member = await h.prisma.teamMember.findFirstOrThrow({ where: { userId: u.id } });
    expect(member.status).toBe('ACTIVE');
    expect(h.mailer.sent.at(-1)!.subject).toContain('on the team');

    // Admins see integrity signals; other users see nothing.
    const asAdmin = await h.http().get(`/api/v1/interviews/${id}`).set(bearer(admin)).expect(200);
    expect(asAdmin.body.integrity).toEqual({ focusLost: 2, avgThinkSec: 1, answers: 6 });
    const other = await registerUser(h);
    await h.http().get(`/api/v1/interviews/${id}`).set(bearer(other)).expect(404);
    await h
      .http()
      .post(`/api/v1/interviews/${id}/turns`)
      .set(bearer(other))
      .send({ position: 1, answer: 'x' })
      .expect(404);
  });

  it('ends below 80 with CV feedback and real courses for what’s missing', async () => {
    const { screened } = await applyAndScreen(55);
    expect(screened).toMatchObject({
      status: 'REJECTED',
      interview: null,
      outcome: {
        reason: 'CV_BELOW_THRESHOLD',
        feedback: expect.stringContaining('measurable outcomes'),
        courses: [expect.objectContaining({ title: 'PostgreSQL for Developers', reason: 'Teaches PostgreSQL' })],
      },
    });
  });

  it('ends below 60 with interview feedback; seats are first come, first served and a full role closes', async () => {
    const weak = await applyAndScreen(85);
    await quickInterview(weak.u, weak.applicationId, 40);
    const rejected = await until(weak.u, weak.applicationId, (b) => b.status === 'REJECTED');
    expect(rejected.outcome).toMatchObject({ reason: 'INTERVIEW_BELOW_THRESHOLD', feedback: expect.any(String) });

    // The backend role has 2 seats; one is taken by the first test. A waiting candidate…
    const waiting = await applyAndScreen(88);
    expect(waiting.screened.status).toBe('INTERVIEW_PENDING');
    // …loses out when someone else passes first and takes the last seat.
    const fast = await applyAndScreen(92);
    await quickInterview(fast.u, fast.applicationId, 75);
    await until(fast.u, fast.applicationId, (b) => b.status === 'SELECTED');

    const other = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    const closed = await until(waiting.u, waiting.applicationId, (b) => b.status === 'REJECTED');
    expect(closed.outcome).toMatchObject({
      reason: 'ROLE_FILLED',
      projects: expect.arrayContaining([expect.objectContaining({ slug: other.slug, roleTitle: 'Backend Developer' })]),
    });
    // New applications for the full role are refused up front.
    const late = await registerUser(h, { verified: true });
    const refused = await applyWith(h, late, project.id, {
      roleId: backendRoleId,
      motivation: 'I want to practise building realtime backends with a real team and deadlines.',
      availabilityHoursPerWeek: 10,
    }).expect(409);
    expect(refused.body.error.code).toBe(ErrorCode.ROLE_FILLED);
  }, 60_000);

  it('lets a failed CV screening be retried', async () => {
    const u = await registerUser(h, { verified: true });
    ai.push(new AiError('FATAL', 'bad request'));
    const res = await applyWith(h, u, project.id, {
      roleId: project.roles.find((r) => r.key === 'frontend')!.id,
      motivation: 'I want to practise building realtime frontends with a real team and deadlines.',
      availabilityHoursPerWeek: 8,
    }).expect(201);
    const failed = await until(u, res.body.id, (b) => (b.screening as { status: string }).status === 'FAILED');
    expect((failed.screening as { failureMessage: string }).failureMessage).toContain('try again');
    ai.push(cvScreen(30));
    await h.http().post(`/api/v1/applications/${res.body.id}/screening/retry`).set(bearer(u)).expect(200);
    const after = await until(u, res.body.id, (b) => b.status === 'REJECTED');
    expect((after.outcome as { reason: string }).reason).toBe('CV_BELOW_THRESHOLD');
  });

  it('skips CV matching on entry-level projects: straight to booking the interview', async () => {
    const beginner = await createProject(h.prisma, { difficulty: 'BEGINNER' });
    const u = await registerUser(h, { verified: true });
    const callsBefore = ai.calls.length;
    const res = await applyWith(
      h,
      u,
      beginner.id,
      {
        roleId: beginner.roles[0].id,
        motivation: 'I am new to backend work and want my first real team project to learn from.',
        availabilityHoursPerWeek: 6,
      },
      null,
    ).expect(201);
    expect(res.body).toMatchObject({
      status: 'INTERVIEW_PENDING',
      cv: null,
      screening: null,
      interview: { status: 'AWAITING_SCHEDULE' },
    });
    expect(res.body.history.map((e: { status: string }) => e.status)).toEqual(['SUBMITTED', 'INTERVIEW_PENDING']);
    // No AI was used to screen anything.
    await new Promise((r) => setTimeout(r, 300));
    expect(ai.calls.length).toBe(callsBefore);
  });
});
