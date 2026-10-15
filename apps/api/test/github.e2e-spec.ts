import { createHmac, randomUUID } from 'node:crypto';
import { ErrorCode } from '@studywidbuddy/shared';
import { GithubClient } from '../src/github/github-client';
import { FakeGithubClient } from './fakes/fake-github.client';
import { bearer, createHarness, type Harness, registerUser, resetDatabase, type TestUser, uniq } from './harness';

const SECRET = 'test-webhook-secret';

describe('GitHub integration (e2e)', () => {
  let h: Harness;
  const gh = new FakeGithubClient();
  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let slug: string;
  let projectId: string;
  let repoId: number;
  let taskId: string;

  beforeAll(async () => {
    h = await createHarness({ overrides: [[GithubClient, gh]] });
    await resetDatabase(h.prisma);
    [admin, alice, bob, outsider] = await Promise.all([
      registerUser(h),
      registerUser(h),
      registerUser(h),
      registerUser(h),
    ]);
    await h.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    admin.token = (
      await h.http().post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }).expect(200)
    ).body.accessToken;

    slug = uniq('gh-');
    const project = await h.prisma.project.create({
      data: {
        slug,
        title: 'Delivery Tracker',
        summary: 'Track deliveries live',
        description: 'd',
        problem: 'Couriers are hard to follow',
        difficulty: 'INTERMEDIATE',
        status: 'IN_PROGRESS',
        durationWeeks: 4,
        teamSize: 2,
        roles: { create: [{ key: 'backend', title: 'Backend Developer', description: 'APIs', seats: 2 }] },
      },
      include: { roles: true },
    });
    projectId = project.id;
    const team = await h.prisma.team.create({ data: { projectId } });
    for (const u of [alice, bob]) {
      const app = await h.prisma.projectApplication.create({
        data: {
          projectId,
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
    }
    taskId = (
      await h
        .http()
        .post(`/api/v1/projects/${slug}/tasks`)
        .set(bearer(alice))
        .send({ title: 'Rotate refresh tokens', status: 'TODO' })
        .expect(201)
    ).body.id;
    await h.http().post(`/api/v1/tasks/${taskId}/move`).set(bearer(alice)).send({ status: 'IN_PROGRESS' }).expect(200);
  });
  afterAll(() => h.close());

  const linkVia = async (u: TestUser, code: string, login: string, id: number) => {
    gh.codes.set(code, { id, login });
    const { url } = (await h.http().post('/api/v1/github/connect').set(bearer(u)).expect(200)).body;
    const state = new URL(url).searchParams.get('state')!;
    return h.http().get(`/api/v1/github/callback?code=${code}&state=${state}`).expect(302);
  };

  function hook(event: string, payload: object, opts: { delivery?: string; secret?: string } = {}) {
    const body = JSON.stringify(payload);
    const sig = `sha256=${createHmac('sha256', opts.secret ?? SECRET)
      .update(body)
      .digest('hex')}`;
    return h
      .http()
      .post('/api/v1/github/webhook')
      .set('content-type', 'application/json')
      .set('x-github-event', event)
      .set('x-github-delivery', opts.delivery ?? randomUUID())
      .set('x-hub-signature-256', sig)
      .send(body);
  }
  const pr = (over: Record<string, unknown> = {}) => ({
    number: 7,
    title: 'TASK-1: Rotate refresh tokens',
    state: 'open',
    draft: false,
    merged: false,
    merged_at: null,
    html_url: 'https://github.com/sb-test-org/x/pull/7',
    user: { login: 'alice-gh' },
    head: { ref: 'task-1-refresh-tokens', sha: 'sha-1' },
    ...over,
  });
  const task = () => h.prisma.task.findUniqueOrThrow({ where: { id: taskId } });

  it('links GitHub accounts through OAuth with a signed, single-user state', async () => {
    const before = await h.http().get('/api/v1/github/status').set(bearer(alice)).expect(200);
    expect(before.body).toEqual({ configured: true, org: 'sb-test-org', account: null });

    const res = await linkVia(alice, 'code-a', 'alice-gh', 11);
    expect(res.headers.location).toBe('http://localhost:4200/settings?github=linked');
    const after = await h.http().get('/api/v1/github/status').set(bearer(alice)).expect(200);
    expect(after.body.account.login).toBe('alice-gh');

    // Someone else can't claim the same GitHub account.
    const taken = await linkVia(outsider, 'code-x', 'alice-gh', 11);
    expect(taken.headers.location).toContain('github=taken');
    // Forged state is refused.
    const forged = await h.http().get('/api/v1/github/callback?code=code-a&state=not-a-jwt').expect(302);
    expect(forged.headers.location).toContain('github=expired');
  });

  it('lets only admins create the private team repo with starter files and member access', async () => {
    const view = await h.http().get(`/api/v1/projects/${slug}/github`).set(bearer(alice)).expect(200);
    expect(view.body).toMatchObject({ configured: true, repo: null, canCreate: false });
    await h.http().post(`/api/v1/projects/${slug}/github/repo`).set(bearer(alice)).expect(403);
    await h.http().get(`/api/v1/projects/${slug}/github`).set(bearer(outsider)).expect(403);

    const created = await h.http().post(`/api/v1/projects/${slug}/github/repo`).set(bearer(admin)).expect(201);
    expect(created.body.repo).toMatchObject({ owner: 'sb-test-org', name: slug, private: true });
    const name = created.body.repo.name;
    expect(gh.grants).toContain(`${name}-team:${name}:push`);
    expect(gh.files.get(`${name}/README.md`)).toContain('TASK-24: Rotate refresh tokens');
    expect(gh.files.get(`${name}/.github/workflows/ci.yml`)).toContain('npm test');
    expect([...gh.teams.get(`${name}-team`)!]).toEqual(['alice-gh']);
    const members = created.body.members.map((m: { githubLogin: string | null; access: string }) => m.access).sort();
    expect(members).toEqual(['GRANTED', 'NOT_LINKED']);

    const again = await h.http().post(`/api/v1/projects/${slug}/github/repo`).set(bearer(admin)).expect(409);
    expect(again.body.error.code).toBe(ErrorCode.REPO_EXISTS);
    repoId = (await h.prisma.projectRepo.findUniqueOrThrow({ where: { projectId } })).githubRepoId as unknown as number;

    // Bob links later and gets access straight away.
    await linkVia(bob, 'code-b', 'bob-gh', 12);
    expect([...gh.teams.get(`${name}-team`)!].sort()).toEqual(['alice-gh', 'bob-gh']);
  });

  it('rejects unsigned or forged webhooks and ignores repos that aren’t team repos', async () => {
    await hook('ping', { zen: 'hi' }, { secret: 'wrong' }).expect(401);
    await h.http().post('/api/v1/github/webhook').set('x-github-event', 'ping').send({}).expect(401);
    const other = await hook('pull_request', {
      action: 'opened',
      repository: { id: 999999 },
      pull_request: pr(),
    }).expect(200);
    expect(other.body.result).toBe('ignored');
  });

  it('links the PR to the task, moves it to review, and gates done on CI', async () => {
    const repository = { id: Number(repoId) };
    const delivery = randomUUID();
    const opened = await hook(
      'pull_request',
      { action: 'opened', repository, pull_request: pr() },
      { delivery },
    ).expect(200);
    expect(opened.body.result).toBe('processed');
    // GitHub retries the same delivery: processed once.
    const dup = await hook('pull_request', { action: 'opened', repository, pull_request: pr() }, { delivery }).expect(
      200,
    );
    expect(dup.body.result).toBe('duplicate');

    expect(await task()).toMatchObject({
      status: 'REVIEW',
      branch: 'task-1-refresh-tokens',
      pullRequestUrl: 'https://github.com/sb-test-org/x/pull/7',
    });
    const view = await h.http().get(`/api/v1/projects/${slug}/github`).set(bearer(bob)).expect(200);
    expect(view.body.pullRequests[0]).toMatchObject({
      number: 7,
      state: 'OPEN',
      checks: 'NONE',
      task: { key: 'TASK-1' },
      author: { login: 'alice-gh', user: { id: alice.id } },
    });
    const chat = await h.http().get(`/api/v1/projects/${slug}/chat`).set(bearer(bob)).expect(200);
    expect(chat.body.messages.at(-1)).toMatchObject({ authorKind: 'SYSTEM' });
    expect(chat.body.messages.at(-1).body).toContain('opened PR #7');

    // CI fails → the task can't be marked done by hand.
    await hook('workflow_run', {
      action: 'completed',
      repository,
      workflow_run: { status: 'completed', conclusion: 'failure', head_sha: 'sha-1', pull_requests: [{ number: 7 }] },
    }).expect(200);
    const blocked = await h
      .http()
      .post(`/api/v1/tasks/${taskId}/move`)
      .set(bearer(alice))
      .send({ status: 'DONE' })
      .expect(409);
    expect(blocked.body.error.code).toBe(ErrorCode.CHECKS_NOT_PASSING);

    // New commits → pending; a stale result for the old commit is ignored.
    await hook('pull_request', {
      action: 'synchronize',
      repository,
      pull_request: pr({ head: { ref: 'task-1-refresh-tokens', sha: 'sha-2' } }),
    }).expect(200);
    await hook('workflow_run', {
      action: 'completed',
      repository,
      workflow_run: { status: 'completed', conclusion: 'success', head_sha: 'sha-1', pull_requests: [{ number: 7 }] },
    }).expect(200);
    expect((await h.prisma.pullRequest.findFirstOrThrow({ where: { projectId, number: 7 } })).checks).toBe('PENDING');

    await hook('workflow_run', {
      action: 'completed',
      repository,
      workflow_run: { status: 'completed', conclusion: 'success', head_sha: 'sha-2', pull_requests: [{ number: 7 }] },
    }).expect(200);
    expect((await h.prisma.pullRequest.findFirstOrThrow({ where: { projectId, number: 7 } })).checks).toBe('SUCCESS');

    // Merged with green CI → done automatically.
    await hook('pull_request', {
      action: 'closed',
      repository,
      pull_request: pr({
        state: 'closed',
        merged: true,
        merged_at: new Date().toISOString(),
        head: { ref: 'task-1-refresh-tokens', sha: 'sha-2' },
      }),
    }).expect(200);
    expect((await task()).status).toBe('DONE');

    await hook('push', {
      repository,
      ref: 'refs/heads/main',
      commits: [{}, {}],
      sender: { login: 'bob-gh' },
    }).expect(200);
    const activity = await h.http().get(`/api/v1/projects/${slug}/activity`).set(bearer(alice)).expect(200);
    const types = activity.body.items.map((a: { type: string }) => a.type);
    expect(types).toEqual(
      expect.arrayContaining([
        'REPO_CREATED',
        'PR_OPENED',
        'CHECKS_FAILED',
        'CHECKS_PASSED',
        'PR_MERGED',
        'CODE_PUSHED',
      ]),
    );
    const push = activity.body.items.find((a: { type: string }) => a.type === 'CODE_PUSHED');
    expect(push).toMatchObject({ actor: { id: bob.id }, summary: 'pushed 2 commits to main' });
  });

  it('unlinks an account', async () => {
    await h.http().delete('/api/v1/github/account').set(bearer(bob)).expect(204);
    expect((await h.http().get('/api/v1/github/status').set(bearer(bob)).expect(200)).body.account).toBeNull();
  });
});
