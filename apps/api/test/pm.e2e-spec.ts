import type { AddressInfo } from 'node:net';
import { ErrorCode, RT_EVENTS } from '@studywidbuddy/shared';
import type { ChatMessageView, PmOverview } from '@studywidbuddy/shared';
import { io, type Socket } from 'socket.io-client';
import { MeetingsService } from '../src/pm/meetings.service';
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

const DAY = 86_400_000;

describe('team chat, AI meetings and the AI PM (e2e)', () => {
  let h: Harness;
  const ai = new ScriptedAiProvider();
  let alice: TestUser;
  let bob: TestUser;
  let outsider: TestUser;
  let admin: TestUser;
  let slug: string;
  let projectId: string;
  let otherProjectId: string;
  let usernames: Record<string, string>;
  let port: number;
  const sockets: Socket[] = [];

  async function makeProject(members: TestUser[], startsAt: Date) {
    const s = uniq('pm-');
    const project = await h.prisma.project.create({
      data: {
        slug: s,
        title: 'Delivery Tracker',
        summary: 'Track deliveries',
        description: 'Build a tracker',
        problem: 'Couriers are hard to follow',
        difficulty: 'INTERMEDIATE',
        status: 'IN_PROGRESS',
        durationWeeks: 4,
        teamSize: 2,
        startsAt,
        roles: { create: [{ key: 'backend', title: 'Backend Developer', description: 'APIs', seats: 2 }] },
      },
      include: { roles: true },
    });
    const team = await h.prisma.team.create({ data: { projectId: project.id } });
    for (const u of members) {
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
    }
    await h.prisma.sprint.create({
      data: {
        projectId: project.id,
        number: 1,
        goal: 'Tracking MVP',
        status: 'ACTIVE',
        startsAt: new Date(Date.now() - 2 * DAY),
        endsAt: new Date(Date.now() + 10 * DAY),
      },
    });
    return { slug: s, id: project.id };
  }

  beforeAll(async () => {
    h = await createHarness({ ai });
    await resetDatabase(h.prisma);
    [alice, bob, outsider, admin] = await Promise.all([
      registerUser(h),
      registerUser(h),
      registerUser(h),
      registerUser(h),
    ]);
    await h.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    admin.token = (
      await h.http().post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }).expect(200)
    ).body.accessToken;
    const profiles = await h.prisma.profile.findMany({ where: { userId: { in: [alice.id, bob.id] } } });
    usernames = Object.fromEntries(profiles.map((p) => [p.userId, p.username]));
    ({ slug, id: projectId } = await makeProject([alice, bob], new Date(Date.now() - 4 * DAY)));
    otherProjectId = (await makeProject([outsider], new Date(Date.now() - DAY))).id;
    // Only the main project takes part in scheduled meetings; the other one checks memory isolation.
    await h.prisma.project.update({ where: { id: otherProjectId }, data: { aiPmEnabled: false } });

    await h.app.listen(0);
    port = (h.app.getHttpServer().address() as AddressInfo).port;
  });
  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await h.close();
  });

  function connect(u: TestUser | { token: string }) {
    const s = io(`http://127.0.0.1:${port}`, {
      path: '/api/socket.io',
      auth: { token: u.token },
      transports: ['websocket'],
      forceNew: true,
    });
    sockets.push(s);
    return s;
  }
  const join = (s: Socket, id: string) =>
    new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const go = () => s.emit(RT_EVENTS.JOIN_PROJECT, { projectId: id }, resolve);
      if (s.connected) go();
      else s.once('connect', go);
    });

  describe('team chat', () => {
    it('is private to the team, paginates and counts unread', async () => {
      await h.http().post(`/api/v1/projects/${slug}/chat`).set(bearer(outsider)).send({ body: 'hi' }).expect(403);
      await h.http().post(`/api/v1/projects/${slug}/chat`).set(bearer(alice)).send({ body: '   ' }).expect(400);
      for (let i = 1; i <= 3; i++) {
        await h
          .http()
          .post(`/api/v1/projects/${slug}/chat`)
          .set(bearer(alice))
          .send({ body: `Message ${i}` })
          .expect(201);
      }
      const unread = await h.http().get(`/api/v1/projects/${slug}/chat/unread`).set(bearer(bob)).expect(200);
      expect(unread.body.count).toBe(3);
      const page = await h.http().get(`/api/v1/projects/${slug}/chat`).set(bearer(bob)).expect(200);
      expect(page.body.messages.map((m: ChatMessageView) => m.body)).toEqual(['Message 1', 'Message 2', 'Message 3']);
      expect(page.body.messages[0].author.id).toBe(alice.id);
      const older = await h
        .http()
        .get(`/api/v1/projects/${slug}/chat?before=${page.body.messages[2].id}`)
        .set(bearer(bob))
        .expect(200);
      expect(older.body.messages.map((m: ChatMessageView) => m.body)).toEqual(['Message 1', 'Message 2']);
      await h.http().post(`/api/v1/projects/${slug}/chat/read`).set(bearer(bob)).expect(204);
      expect((await h.http().get(`/api/v1/projects/${slug}/chat/unread`).set(bearer(bob)).expect(200)).body.count).toBe(
        0,
      );
    });

    it('pushes messages and presence over sockets, only to members', async () => {
      const bobSocket = connect(bob);
      expect(await join(bobSocket, projectId)).toEqual({ ok: true });
      const outsiderSocket = connect(outsider);
      expect((await join(outsiderSocket, projectId)).ok).toBe(false);

      const received = new Promise<ChatMessageView>((resolve) => bobSocket.once(RT_EVENTS.CHAT_MESSAGE, resolve));
      let leaked = false;
      outsiderSocket.on(RT_EVENTS.CHAT_MESSAGE, () => (leaked = true));
      const presence = new Promise<{ online: string[] }>((resolve) =>
        bobSocket.on(RT_EVENTS.PRESENCE, (p: { online: string[] }) => p.online.length === 2 && resolve(p)),
      );
      const aliceSocket = connect(alice);
      await join(aliceSocket, projectId);
      expect((await presence).online.sort()).toEqual([alice.id, bob.id].sort());

      await h.http().post(`/api/v1/projects/${slug}/chat`).set(bearer(alice)).send({ body: 'Live!' }).expect(201);
      expect((await received).body).toBe('Live!');
      await new Promise((r) => setTimeout(r, 200));
      expect(leaked).toBe(false);
    });

    it('refuses sockets without a valid token', async () => {
      const s = connect({ token: 'not-a-jwt' });
      const err = await new Promise<Error>((resolve) => s.on('connect_error', resolve));
      expect(err.message).toBe('unauthorized');
      expect(s.connected).toBe(false);
    });
  });

  describe('AI meetings and the agent', () => {
    let meetingId: string;
    const meetings = () => h.app.get(MeetingsService);

    it('opens a check-in when it is due, with personal questions for each member', async () => {
      ai.push((req: { system: string }) => {
        expect(req.system).toContain('check-in #1');
        return {
          agenda: 'Sprint 1 is under way. Let us surface blockers early and confirm owners.',
          participants: [
            {
              username: usernames[alice.id],
              questions: [
                'What did you finish on the tracking API since we started?',
                'What are you doing next on the courier endpoints?',
                'Explain how you plan to store courier positions efficiently.',
              ],
            },
            // Bob is left out on purpose: he must still get the standard questions.
          ],
        };
      });
      const r = await meetings().tick();
      expect(r.opened).toBe(1);
      // A second tick doesn't open another one while this is in progress.
      expect((await meetings().tick()).opened).toBe(0);

      const pm = await waitFor(async () => {
        const res = await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice));
        return res.body.openMeeting?.status === 'OPEN' ? (res.body as PmOverview) : false;
      });
      meetingId = pm.openMeeting!.id;
      expect(pm.openMeeting).toMatchObject({ number: 1, kind: 'CHECK_IN', participants: 2, myStatus: 'PENDING' });
      expect(ai.calls.at(-1)!.tier).toBe('fast');

      const view = (await h.http().get(`/api/v1/meetings/${meetingId}`).set(bearer(alice)).expect(200)).body;
      const mine = view.people.find((p: { user: { id: string } }) => p.user.id === alice.id);
      const bobs = view.people.find((p: { user: { id: string } }) => p.user.id === bob.id);
      expect(mine.questions[2].prompt).toContain('courier positions');
      // Teammates' questions and answers stay hidden until the meeting is summarized.
      expect(bobs.questions).toBeNull();
      const bobView = (await h.http().get(`/api/v1/meetings/${meetingId}`).set(bearer(bob)).expect(200)).body;
      expect(bobView.people.find((p: { user: { id: string } }) => p.user.id === bob.id).questions[0].prompt).toContain(
        'What did you finish',
      );

      await h.http().get(`/api/v1/meetings/${meetingId}`).set(bearer(outsider)).expect(403);
      const chat = await h.http().get(`/api/v1/projects/${slug}/chat`).set(bearer(alice)).expect(200);
      const post = chat.body.messages.at(-1);
      expect(post).toMatchObject({ authorKind: 'AI', author: null, ref: { type: 'meeting', id: meetingId } });
      expect(post.body).toContain('Check-in #1 is open');
    });

    it('collects answers, summarizes into memory and chat, then runs the agent on follow-ups', async () => {
      ai.push(
        // summary
        {
          summary: 'Good start: Alice has the tracking API skeleton, Bob is setting up auth.',
          highlights: ['Tracking API skeleton done'],
          risks: ['Auth may slip past the sprint'],
          members: [
            { username: usernames[alice.id], note: 'Clear update and a solid explanation of geo indexing.' },
            { username: usernames[bob.id], note: 'Brief; needs to break auth into smaller tasks.' },
          ],
          memory: [
            { kind: 'RISK', content: 'Auth work may slip past sprint 1.', about_username: usernames[bob.id] },
            { kind: 'DECISION', content: 'Courier positions stored with a GiST index.', about_username: null },
          ],
          follow_ups: ['Propose a task to split auth into smaller pieces for Bob'],
        },
        // agent: read, then propose + remember, then finish
        { text: 'Let me look at the board.', toolCalls: [{ name: 'get_board', input: {} }] },
        {
          toolCalls: [
            {
              name: 'create_task',
              input: {
                title: 'Split auth: token refresh endpoint',
                priority: 'HIGH',
                estimate: 3,
                assignee_username: usernames[bob.id],
                add_to_active_sprint: true,
              },
            },
            { name: 'create_task', input: { title: 'x', priority: 'URGENT', estimate: 4 } },
            { name: 'remember', input: { kind: 'FACT', content: 'Proposed splitting auth after check-in #1.' } },
            { name: 'delete_everything', input: {} },
          ],
        },
        { text: 'I proposed one task for Bob to split the auth work.' },
      );

      const answer = (u: TestUser, position: number, text: string, viaVoice = false) =>
        h
          .http()
          .put(`/api/v1/meetings/${meetingId}/questions/${position}/answer`)
          .set(bearer(u))
          .send({ answer: text, viaVoice });
      for (const p of [1, 2, 3]) await answer(alice, p, `Alice answer ${p} with enough detail.`, true).expect(200);
      await answer(outsider, 1, 'x').expect(404);
      await answer(bob, 9, 'x').expect(404);
      for (const p of [1, 2, 3]) await answer(bob, p, `Bob answer ${p}`).expect(200);

      const closed = await waitFor(async () => {
        const r = await h.http().get(`/api/v1/meetings/${meetingId}`).set(bearer(alice));
        return r.body.status === 'CLOSED' ? r.body : false;
      });
      expect(closed.risks).toEqual(['Auth may slip past the sprint']);
      // After the summary, everyone sees everyone's answers and the AI's notes.
      const bobRow = closed.people.find((p: { user: { id: string } }) => p.user.id === bob.id);
      expect(bobRow.questions[0].answer).toBe('Bob answer 1');
      expect(bobRow.aiNote).toContain('smaller tasks');
      expect(ai.calls.find((c) => c.purpose === 'pm.meeting.summary')!.messages[0].content).toContain(
        'source="speech-to-text"',
      );
      await answer(alice, 1, 'too late').expect(409);

      const pm = await waitFor(async () => {
        const r = await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice));
        return r.body.runs[0]?.status === 'COMPLETED' ? (r.body as PmOverview) : false;
      });
      // Memory: the meeting summary, the two entries from the summary, and the agent's own note.
      expect(pm.memory.map((m) => m.kind).sort()).toEqual(['DECISION', 'FACT', 'RISK', 'SUMMARY']);
      expect(pm.memory.find((m) => m.kind === 'RISK')!.subject!.id).toBe(bob.id);
      expect(pm.runs[0]).toMatchObject({
        trigger: 'MEETING_SUMMARY',
        meetingId,
        pendingApprovals: 1,
        summary: 'I proposed one task for Bob to split the auth work.',
      });
      expect(pm.approvals).toHaveLength(1);
      expect(pm.approvals[0].label).toContain('Split auth: token refresh endpoint');

      const run = (await h.http().get(`/api/v1/pm/runs/${pm.runs[0].id}`).set(bearer(bob)).expect(200)).body;
      const calls = run.steps.flatMap((s: { toolCalls: { tool: string; status: string }[] }) => s.toolCalls);
      expect(calls.map((c: { tool: string; status: string }) => `${c.tool}:${c.status}`)).toEqual([
        'get_board:EXECUTED',
        'create_task:PROPOSED',
        'create_task:FAILED',
        'remember:EXECUTED',
        'delete_everything:FAILED',
      ]);
      // Tool results went back to the model, including the validation errors.
      const lastAgentCall = ai.calls.filter((c) => c.purpose === 'pm.agent').at(-1)!;
      const toolResults = JSON.stringify(lastAgentCall.messages.at(-1));
      expect(toolResults).toContain('NOT happened yet');
      expect(toolResults).toContain('Unknown tool');
      await h.http().get(`/api/v1/pm/runs/${pm.runs[0].id}`).set(bearer(outsider)).expect(403);

      // Nothing was created before approval.
      expect(await h.prisma.task.count({ where: { projectId } })).toBe(0);
    });

    it('creates the task only when a member approves, as that member', async () => {
      const pm = (await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice)).expect(200)).body as PmOverview;
      const proposal = pm.approvals[0];
      await h.http().post(`/api/v1/pm/proposals/${proposal.id}/approve`).set(bearer(outsider)).expect(403);
      const ok = await h.http().post(`/api/v1/pm/proposals/${proposal.id}/approve`).set(bearer(alice)).expect(200);
      expect(ok.body).toMatchObject({ status: 'EXECUTED', decidedBy: { id: alice.id }, result: { ok: true } });
      const again = await h.http().post(`/api/v1/pm/proposals/${proposal.id}/approve`).set(bearer(bob)).expect(409);
      expect(again.body.error.code).toBe(ErrorCode.APPROVAL_NOT_PENDING);

      const task = await h.prisma.task.findFirstOrThrow({ where: { projectId } });
      expect(task).toMatchObject({
        title: 'Split auth: token refresh endpoint',
        aiSuggested: true,
        assigneeId: bob.id,
        status: 'TODO',
        createdById: alice.id,
      });
      const activity = await h.http().get(`/api/v1/projects/${slug}/activity`).set(bearer(bob)).expect(200);
      expect(activity.body.items.map((a: { type: string }) => a.type)).toContain('AGENT_ACTION_APPROVED');
    });

    it('lets members run the AI PM by hand; failed approvals are recorded, rejections too', async () => {
      ai.push(
        {
          toolCalls: [
            {
              name: 'update_task',
              input: { key: 'TASK-1', assignee_username: 'nobody-here', reason: 'Balance the workload' },
            },
            { name: 'update_task', input: { key: 'TASK-1', priority: 'LOW', reason: 'Not urgent any more' } },
            { name: 'post_message', input: { body: 'Heads up: I proposed two changes to TASK-1.' } },
          ],
        },
        { text: 'Proposed two changes to TASK-1.' },
      );
      const started = await h
        .http()
        .post(`/api/v1/projects/${slug}/pm/runs`)
        .set(bearer(bob))
        .send({ goal: 'Rebalance TASK-1' })
        .expect(201);
      expect(started.body).toMatchObject({ trigger: 'MANUAL', requestedBy: { id: bob.id } });
      await waitFor(async () => {
        const r = await h.http().get(`/api/v1/pm/runs/${started.body.id}`).set(bearer(bob));
        return r.body.status === 'COMPLETED';
      });
      const pm = (await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(bob)).expect(200)).body as PmOverview;
      expect(pm.approvals).toHaveLength(2);
      const reassign = pm.approvals.find((a) => a.label.includes('nobody-here'))!;
      const lower = pm.approvals.find((a) => a.label.includes('priority low'))!;

      // The proposed assignee isn't on the team: approving runs it, it fails safely.
      const failed = await h.http().post(`/api/v1/pm/proposals/${reassign.id}/approve`).set(bearer(bob)).expect(200);
      expect(failed.body).toMatchObject({ status: 'FAILED', result: { ok: false } });
      expect(JSON.stringify(failed.body.result.output)).toContain('not an active member');

      const rejected = await h.http().post(`/api/v1/pm/proposals/${lower.id}/reject`).set(bearer(bob)).expect(200);
      expect(rejected.body.status).toBe('REJECTED');
      expect((await h.prisma.task.findFirstOrThrow({ where: { projectId } })).priority).toBe('HIGH');

      const chat = await h.http().get(`/api/v1/projects/${slug}/chat`).set(bearer(alice)).expect(200);
      expect(chat.body.messages.at(-1)).toMatchObject({
        authorKind: 'AI',
        body: 'Heads up: I proposed two changes to TASK-1.',
      });
    });

    it('keeps memory per project and lets members remove a wrong memory', async () => {
      await h.prisma.projectMemory.create({
        data: { projectId: otherProjectId, kind: 'FACT', content: 'Secret of another team', sourceType: 'MANUAL' },
      });
      const pm = (await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice)).expect(200)).body as PmOverview;
      expect(pm.memory.some((m) => m.content.includes('another team'))).toBe(false);
      const agentPrompt = ai.calls.filter((c) => c.purpose === 'pm.agent').at(-1)!.system;
      expect(agentPrompt).not.toContain('another team');
      expect(agentPrompt).toContain('GiST index');

      const target = pm.memory.find((m) => m.kind === 'DECISION')!;
      const otherSlug = (await h.prisma.project.findUniqueOrThrow({ where: { id: otherProjectId } })).slug;
      await h.http().delete(`/api/v1/projects/${otherSlug}/pm/memory/${target.id}`).set(bearer(outsider)).expect(404);
      await h.http().delete(`/api/v1/projects/${slug}/pm/memory/${target.id}`).set(bearer(alice)).expect(204);
      const after = (await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice)).expect(200)).body;
      expect(after.memory.some((m: { id: string }) => m.id === target.id)).toBe(false);
    });

    it('holds a final review near the planned end, and only admins can call it early', async () => {
      const early = await h
        .http()
        .post(`/api/v1/projects/${slug}/meetings`)
        .set(bearer(alice))
        .send({ kind: 'FINAL_REVIEW' })
        .expect(403);
      expect(early.body.error.code).toBe(ErrorCode.FORBIDDEN);

      await h.prisma.project.update({
        where: { id: projectId },
        data: { startsAt: new Date(Date.now() - (4 * 7 - 2) * DAY) },
      });
      ai.push({
        agenda: 'Final review: everyone walks through their work.',
        participants: [usernames[alice.id], usernames[bob.id]].map((u) => ({
          username: u,
          questions: ['A', 'B', 'C', 'D', 'E'].map((x) => `Explain part ${x} of what you built in detail.`),
        })),
      });
      const now = new Date();
      expect((await meetings().tick(now)).opened).toBe(1);
      const final = await waitFor(async () => {
        const r = await h.http().get(`/api/v1/projects/${slug}/pm`).set(bearer(alice));
        return r.body.openMeeting?.status === 'OPEN' ? r.body.openMeeting : false;
      });
      expect(final.kind).toBe('FINAL_REVIEW');
      const view = (await h.http().get(`/api/v1/meetings/${final.id}`).set(bearer(alice)).expect(200)).body;
      expect(view.people.find((p: { user: { id: string } }) => p.user.id === alice.id).questions).toHaveLength(5);
      expect(ai.calls.at(-1)!.tier).toBeUndefined();

      // Window passes with nobody answering: the tick closes it and everyone is marked missed.
      ai.push({
        summary: 'Nobody answered the final review in time.',
        highlights: [],
        risks: ['No final walkthroughs recorded'],
        members: [],
        memory: [],
        follow_ups: [],
      });
      expect((await meetings().tick(new Date(Date.now() + 49 * 3_600_000))).closed).toBe(1);
      const done = await waitFor(async () => {
        const r = await h.http().get(`/api/v1/meetings/${final.id}`).set(bearer(alice));
        return r.body.status === 'CLOSED' ? r.body : false;
      });
      expect(done.people.map((p: { status: string }) => p.status)).toEqual(['MISSED', 'MISSED']);
      // A final review happens once.
      expect((await meetings().tick(new Date(Date.now() + 50 * 3_600_000))).opened).toBe(0);
    });
  });
});
