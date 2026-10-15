import { ErrorCode } from '@studywidbuddy/shared';
import { ScriptedAiProvider } from './fakes/scripted-ai.provider';
import {
  bearer,
  createHarness,
  type Harness,
  registerUser,
  resetDatabase,
  type TestUser,
  uniq,
  waitFor,
} from './harness';

describe('project workspace (e2e)', () => {
  let h: Harness;
  const ai = new ScriptedAiProvider();
  let member: TestUser;
  let teammate: TestUser;
  let outsider: TestUser;
  let invited: TestUser;
  let slug: string;
  let backendRoleId: string;

  beforeAll(async () => {
    h = await createHarness({ ai });
    await resetDatabase(h.prisma);
    [member, teammate, outsider, invited] = await Promise.all([
      registerUser(h),
      registerUser(h),
      registerUser(h),
      registerUser(h),
    ]);
    slug = uniq('ws-');
    const project = await h.prisma.project.create({
      data: {
        slug,
        title: 'Workspace Project',
        summary: 's',
        description: 'Build a thing',
        problem: 'A problem',
        difficulty: 'INTERMEDIATE',
        status: 'IN_PROGRESS',
        durationWeeks: 4,
        teamSize: 3,
        roles: {
          create: [
            { key: 'backend', title: 'Backend Developer', description: 'APIs', seats: 2 },
            { key: 'frontend', title: 'Frontend Developer', description: 'UI', seats: 1 },
          ],
        },
      },
      include: { roles: true },
    });
    backendRoleId = project.roles.find((r) => r.key === 'backend')!.id;
    const team = await h.prisma.team.create({ data: { projectId: project.id } });
    for (const [u, status] of [
      [member, 'ACTIVE'],
      [teammate, 'ACTIVE'],
      [invited, 'INVITED'],
    ] as const) {
      const app = await h.prisma.projectApplication.create({
        data: {
          projectId: project.id,
          roleId: backendRoleId,
          userId: u.id,
          motivation: 'm'.repeat(50),
          availabilityHoursPerWeek: 10,
          status: 'SELECTED',
        },
      });
      await h.prisma.teamMember.create({
        data: { teamId: team.id, userId: u.id, roleId: backendRoleId, applicationId: app.id, status },
      });
    }
  });
  afterAll(() => h.close());

  const create = (u: TestUser, body: object) =>
    h.http().post(`/api/v1/projects/${slug}/tasks`).set(bearer(u)).send(body);
  const move = (u: TestUser, id: string, status: string, beforeTaskId?: string) =>
    h.http().post(`/api/v1/tasks/${id}/move`).set(bearer(u)).send({ status, beforeTaskId });

  it('is private to active team members', async () => {
    const outside = await h.http().get(`/api/v1/projects/${slug}/workspace`).set(bearer(outsider)).expect(403);
    expect(outside.body.error.code).toBe(ErrorCode.NOT_A_TEAM_MEMBER);
    await h.http().get(`/api/v1/projects/${slug}/workspace`).set(bearer(invited)).expect(403);
    await h.http().get(`/api/v1/projects/${slug}/workspace`).set(bearer(member)).expect(200);
    await create(outsider, { title: 'Sneaky task' }).expect(403);
  });

  it('numbers tasks, enforces the board state machine and dependencies', async () => {
    const migration = (
      await create(member, { title: 'Database migration', estimate: 3, roleId: backendRoleId, status: 'TODO' }).expect(
        201,
      )
    ).body;
    const auth = (
      await create(member, { title: 'Refresh token rotation', estimate: 5, assigneeId: teammate.id }).expect(201)
    ).body;
    expect([migration.key, auth.key]).toEqual(['TASK-1', 'TASK-2']);
    expect(auth.assignee.id).toBe(teammate.id);

    // Concurrent creates still get unique numbers.
    const many = await Promise.all([1, 2, 3].map((i) => create(member, { title: `Parallel ${i}` }).expect(201)));
    expect(new Set(many.map((r) => r.body.number)).size).toBe(3);

    await create(member, { title: 'Bad estimate', estimate: 4 }).expect(400);
    await create(member, { title: 'Bad assignee', assigneeId: outsider.id }).expect(400);

    // Dependencies and cycles.
    await h
      .http()
      .put(`/api/v1/tasks/${auth.id}/dependencies`)
      .set(bearer(member))
      .send({ dependsOn: [migration.id] })
      .expect(200);
    const cycle = await h
      .http()
      .put(`/api/v1/tasks/${migration.id}/dependencies`)
      .set(bearer(member))
      .send({ dependsOn: [auth.id] })
      .expect(409);
    expect(cycle.body.error.code).toBe(ErrorCode.DEPENDENCY_CYCLE);
    expect(cycle.body.error.message).toContain('TASK-1 → TASK-2 → TASK-1');

    // Can't skip review; can't finish while blocked.
    await move(member, auth.id, 'IN_PROGRESS').expect(200);
    const skip = await move(member, auth.id, 'DONE').expect(409);
    expect(skip.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);
    await move(member, auth.id, 'REVIEW').expect(200);
    const blocked = await move(member, auth.id, 'DONE').expect(409);
    expect(blocked.body.error.code).toBe(ErrorCode.TASK_BLOCKED);
    const detail = await h.http().get(`/api/v1/tasks/${auth.id}`).set(bearer(member)).expect(200);
    expect(detail.body.blockedBy).toEqual([{ id: migration.id, key: 'TASK-1' }]);
    expect(detail.body.allowedMoves).toEqual(['IN_PROGRESS']);

    for (const s of ['IN_PROGRESS', 'REVIEW', 'DONE']) await move(teammate, migration.id, s).expect(200);
    const done = await move(member, auth.id, 'DONE').expect(200);
    expect(done.body.status).toBe('DONE');

    // Ordering inside a column.
    const a = (await create(member, { title: 'Order A', status: 'TODO' })).body;
    const b = (await create(member, { title: 'Order B', status: 'TODO' })).body;
    await move(member, b.id, 'TODO', a.id).expect(200);
    const todo = await h.http().get(`/api/v1/projects/${slug}/tasks?status=TODO`).set(bearer(member)).expect(200);
    const order = todo.body.map((t: { id: string }) => t.id);
    expect(order.indexOf(b.id)).toBeLessThan(order.indexOf(a.id));

    // Comments + activity trail.
    await h
      .http()
      .post(`/api/v1/tasks/${auth.id}/comments`)
      .set(bearer(teammate))
      .send({ body: 'Shipped, thanks!' })
      .expect(201);
    const activity = await h.http().get(`/api/v1/projects/${slug}/activity?limit=50`).set(bearer(member)).expect(200);
    const types = activity.body.items.map((i: { type: string }) => i.type);
    expect(types).toEqual(
      expect.arrayContaining(['TASK_CREATED', 'TASK_STATUS_CHANGED', 'TASK_DEPENDENCIES_CHANGED', 'TASK_COMMENTED']),
    );
    expect(activity.body.items.find((i: { type: string }) => i.type === 'TASK_STATUS_CHANGED').summary).toMatch(
      /moved TASK-\d+ from/,
    );
  });

  it('runs sprints: one active at a time, unfinished work carries over', async () => {
    const now = Date.now();
    const s1 = (
      await h
        .http()
        .post(`/api/v1/projects/${slug}/sprints`)
        .set(bearer(member))
        .send({
          goal: 'Auth and orders',
          startsAt: new Date(now - 86400000).toISOString(),
          endsAt: new Date(now + 6 * 86400000).toISOString(),
        })
        .expect(201)
    ).body;
    const s2 = (
      await h
        .http()
        .post(`/api/v1/projects/${slug}/sprints`)
        .set(bearer(member))
        .send({
          goal: 'Tracking',
          startsAt: new Date(now + 7 * 86400000).toISOString(),
          endsAt: new Date(now + 14 * 86400000).toISOString(),
        })
        .expect(201)
    ).body;
    expect([s1.number, s2.number]).toEqual([1, 2]);

    const t = (await create(member, { title: 'Sprint work', estimate: 8, sprintId: s1.id, status: 'TODO' })).body;
    await h.http().post(`/api/v1/sprints/${s1.id}/start`).set(bearer(member)).expect(200);
    await h.http().post(`/api/v1/sprints/${s2.id}/start`).set(bearer(member)).expect(409);

    const overview = await h.http().get(`/api/v1/projects/${slug}/workspace`).set(bearer(member)).expect(200);
    expect(overview.body.activeSprint).toMatchObject({ number: 1, points: { total: 8, done: 0 } });
    expect(overview.body.burndown.length).toBeGreaterThan(5);
    expect(overview.body.health).not.toBe('NOT_STARTED');
    expect(overview.body.members.map((m: { user: { id: string } }) => m.user.id).sort()).toEqual(
      [member.id, teammate.id].sort(),
    );

    await h.http().post(`/api/v1/sprints/${s1.id}/complete`).set(bearer(member)).expect(200);
    const after = await h.http().get(`/api/v1/tasks/${t.id}`).set(bearer(member)).expect(200);
    expect(after.body.sprintId).toBe(s2.id);
  });

  it('turns an approved AI plan into tasks, and rejects invalid plans', async () => {
    const valid = {
      rationale: 'Schema first so the API and UI can build in parallel.',
      milestones: [{ title: 'MVP live on staging', dueInDays: 28 }],
      sprints: [
        { number: 1, goal: 'Foundations', durationDays: 14 },
        { number: 2, goal: 'Features', durationDays: 14 },
      ],
      tasks: [
        {
          key: 'T1',
          title: 'Set up CI',
          description: '',
          acceptanceCriteria: ['Pipeline runs on PRs'],
          roleKey: 'backend',
          estimate: 2,
          priority: 'HIGH',
          sprintNumber: 1,
          dependsOn: [],
        },
        {
          key: 'T2',
          title: 'Orders schema',
          description: '',
          acceptanceCriteria: ['Migration applies'],
          roleKey: 'backend',
          estimate: 3,
          priority: 'HIGH',
          sprintNumber: 1,
          dependsOn: ['T1'],
        },
        {
          key: 'T3',
          title: 'Orders list UI',
          description: '',
          acceptanceCriteria: ['Shows orders'],
          roleKey: 'frontend',
          estimate: 5,
          priority: 'MEDIUM',
          sprintNumber: 2,
          dependsOn: ['T2'],
        },
      ],
    };
    // Invalid cross-reference (unknown role) on every attempt → FAILED, nothing created.
    const invalid = { ...valid, tasks: valid.tasks.map((t) => ({ ...t, roleKey: 'chef' })) };
    ai.push(invalid, invalid, invalid);
    const failed = await h.http().post(`/api/v1/projects/${slug}/plans`).set(bearer(member)).expect(201);
    await waitFor(
      async () =>
        (await h.http().get(`/api/v1/projects/${slug}/plans/latest`).set(bearer(member))).body.status === 'FAILED',
      60_000,
    );
    await h.http().post(`/api/v1/plans/${failed.body.id}/discard`).set(bearer(member)).expect(200);

    const before = await h.prisma.task.count({ where: { project: { slug } } });
    ai.push(valid);
    const req = await h.http().post(`/api/v1/projects/${slug}/plans`).set(bearer(member)).expect(201);
    const proposed = await waitFor(async () => {
      const r = await h.http().get(`/api/v1/projects/${slug}/plans/latest`).set(bearer(member));
      return r.body.status === 'PROPOSED' ? r.body : false;
    });
    expect(proposed.id).toBe(req.body.id);
    expect(await h.prisma.task.count({ where: { project: { slug } } })).toBe(before); // nothing until approved

    await h.http().post(`/api/v1/plans/${proposed.id}/apply`).set(bearer(outsider)).expect(403);
    await h.http().post(`/api/v1/plans/${proposed.id}/apply`).set(bearer(member)).expect(200);
    await h.http().post(`/api/v1/plans/${proposed.id}/apply`).set(bearer(member)).expect(409);

    const tasks = await h.prisma.task.findMany({
      where: { project: { slug }, aiSuggested: true },
      orderBy: { number: 'asc' },
      include: { dependsOn: true, sprint: true },
    });
    expect(tasks.map((t) => t.title)).toEqual(['Set up CI', 'Orders schema', 'Orders list UI']);
    expect(tasks[1].dependsOn.map((d) => d.dependsOnId)).toEqual([tasks[0].id]);
    expect(tasks[0].status).toBe('TODO');
    expect(tasks[2].status).toBe('BACKLOG');
    expect(tasks[2].sprint!.number).toBeGreaterThan(tasks[0].sprint!.number);
  }, 90_000);
});
