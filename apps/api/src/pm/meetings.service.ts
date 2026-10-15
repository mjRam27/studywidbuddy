import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type MeetingKind,
  MeetingStatus,
  ParticipantStatus,
  Prisma,
  ProjectStatus,
  TeamMemberStatus,
} from '@prisma/client';
import { ErrorCode, RT_EVENTS } from '@studywidbuddy/shared';
import type { MeetingSummary, MeetingView } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { ActivityService } from '../activity/activity.service';
import { AiError, AiProvider } from '../ai/ai-provider';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { PM_QUEUE } from '../queue/queue.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WorkspaceAccess } from '../tasks/workspace-access.service';
import { AgentService } from './agent.service';
import { MemoryService } from './memory.service';
import {
  CHECK_IN_QUESTIONS,
  DEFAULT_CHECK_IN,
  DEFAULT_FINAL_REVIEW,
  FINAL_REVIEW_QUESTIONS,
  meetingQuestionsPrompt,
  MeetingQuestionsSchema,
  meetingSummaryPrompt,
  MeetingSummarySchema,
  type MeetingTranscript,
} from './pm-ai';
import { ProjectSnapshotService } from './project-snapshot.service';

export const JOB_MEETING_PREPARE = 'meeting.prepare';
export const JOB_MEETING_SUMMARIZE = 'meeting.summarize';
export const JOB_PM_TICK = 'pm.tick';

const OPEN_STATES: MeetingStatus[] = [MeetingStatus.PREPARING, MeetingStatus.OPEN, MeetingStatus.SUMMARIZING];
/** How long members have to answer. */
export const WINDOW_HOURS: Record<MeetingKind, number> = { CHECK_IN: 24, FINAL_REVIEW: 48 };
/** The final review is scheduled this close to the planned end. */
const FINAL_REVIEW_LEAD_DAYS = 3;
const DAY = 86_400_000;

const viewInclude = {
  project: { select: { slug: true, title: true } },
  participants: {
    orderBy: { user: { profile: { displayName: 'asc' } } },
    include: { user: { select: personSelect }, questions: { orderBy: { position: 'asc' } } },
  },
} satisfies Prisma.ProjectMeetingInclude;
type MeetingRow = Prisma.ProjectMeetingGetPayload<{ include: typeof viewInclude }>;

/**
 * AI-led team meetings. Every N days (default 3) while a project is in progress, the AI PM
 * opens a check-in with personal questions for each member, based on the board and its
 * memory. Members answer by voice or text inside the window; then the AI PM summarizes,
 * updates its memory, posts to the team chat and starts an agent run for follow-ups.
 * Near the planned end it holds a final review where everyone explains their work.
 */
@Injectable()
export class MeetingsService {
  private readonly logger = new Logger(MeetingsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly access: WorkspaceAccess,
    private readonly snapshot: ProjectSnapshotService,
    private readonly memory: MemoryService,
    private readonly chat: ChatService,
    private readonly agent: AgentService,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(PM_QUEUE) private readonly queue: Queue,
  ) {}

  // ───────── scheduling ─────────

  /**
   * Runs every few minutes. Closes meetings whose window passed and opens the next one
   * when it's due. Safe to run concurrently: the partial unique index allows only one
   * meeting in progress per project.
   */
  async tick(now = new Date()): Promise<{ opened: number; closed: number }> {
    let closed = 0;
    const expired = await this.prisma.projectMeeting.findMany({
      where: { status: MeetingStatus.OPEN, closesAt: { lte: now } },
      select: { id: true },
    });
    for (const m of expired) if (await this.beginSummary(m.id)) closed++;

    let opened = 0;
    if (!this.ai.isConfigured()) return { opened, closed };
    const projects = await this.prisma.project.findMany({
      where: {
        status: ProjectStatus.IN_PROGRESS,
        aiPmEnabled: true,
        team: { members: { some: { status: TeamMemberStatus.ACTIVE } } },
        meetings: { none: { status: { in: OPEN_STATES } } },
      },
      select: {
        id: true,
        startsAt: true,
        durationWeeks: true,
        meetingIntervalDays: true,
        team: { select: { formedAt: true } },
        meetings: { orderBy: { number: 'desc' }, take: 1, select: { opensAt: true, kind: true } },
      },
    });
    for (const p of projects) {
      const kind = await this.dueKind(p, now);
      if (!kind) continue;
      try {
        await this.open(p.id, kind);
        opened++;
      } catch (e) {
        if (!(e instanceof DomainError)) throw e; // another tick won the race
      }
    }
    return { opened, closed };
  }

  /** Which meeting (if any) is due for a project right now. */
  private async dueKind(
    p: {
      id: string;
      startsAt: Date | null;
      durationWeeks: number;
      meetingIntervalDays: number;
      team: { formedAt: Date } | null;
      meetings: { opensAt: Date; kind: MeetingKind }[];
    },
    now: Date,
  ): Promise<MeetingKind | null> {
    const start = p.startsAt ?? p.team?.formedAt ?? null;
    if (!start) return null;
    const end = new Date(start.getTime() + p.durationWeeks * 7 * DAY);
    if (end.getTime() - now.getTime() <= FINAL_REVIEW_LEAD_DAYS * DAY) {
      const hadFinal = await this.prisma.projectMeeting.count({ where: { projectId: p.id, kind: 'FINAL_REVIEW' } });
      return hadFinal ? null : 'FINAL_REVIEW';
    }
    const last = p.meetings[0]?.opensAt ?? start;
    return now.getTime() - last.getTime() >= p.meetingIntervalDays * DAY ? 'CHECK_IN' : null;
  }

  /** A member (or admin) can call a check-in early; admins can call the final review. */
  async startNow(user: AuthUser, slug: string, kind: MeetingKind): Promise<MeetingView> {
    const ctx = await this.access.bySlug(user, slug);
    if (kind === 'FINAL_REVIEW' && !ctx.isAdmin) {
      throw new DomainError(
        ErrorCode.FORBIDDEN,
        'Only an admin can call the final review early.',
        HttpStatus.FORBIDDEN,
      );
    }
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'AI meetings aren’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const id = await this.open(ctx.projectId, kind);
    return this.view(user, id);
  }

  private async open(projectId: string, kind: MeetingKind): Promise<string> {
    const members = await this.prisma.teamMember.findMany({
      where: { status: TeamMemberStatus.ACTIVE, team: { projectId } },
      select: { userId: true },
    });
    if (!members.length) {
      throw new DomainError(ErrorCode.CONFLICT, 'This project has no active team members.', HttpStatus.CONFLICT);
    }
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${projectId}::uuid FOR UPDATE`;
        const last = await tx.projectMeeting.findFirst({
          where: { projectId },
          orderBy: { number: 'desc' },
          select: { number: true },
        });
        const m = await tx.projectMeeting.create({
          data: {
            projectId,
            kind,
            number: (last?.number ?? 0) + 1,
            closesAt: new Date(Date.now() + WINDOW_HOURS[kind] * 3_600_000),
            participants: { create: members.map((x) => ({ userId: x.userId })) },
          },
        });
        return m.id;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(
          ErrorCode.MEETING_IN_PROGRESS,
          'A meeting is already in progress for this project.',
          HttpStatus.CONFLICT,
        );
      }
      throw e;
    }
    await this.queue.add(JOB_MEETING_PREPARE, { meetingId: id }, { jobId: `${JOB_MEETING_PREPARE}-${id}` });
    this.notify(projectId, id);
    return id;
  }

  // ───────── worker: prepare ─────────

  async prepare(meetingId: string): Promise<void> {
    const m = await this.prisma.projectMeeting.findUnique({
      where: { id: meetingId },
      include: { participants: { include: { user: { select: { profile: { select: { username: true } } } } } } },
    });
    if (!m || m.status !== MeetingStatus.PREPARING) return;
    const snap = await this.snapshot.load(m.projectId);
    const last = await this.prisma.projectMeeting.findFirst({
      where: { projectId: m.projectId, status: MeetingStatus.CLOSED, number: { lt: m.number } },
      orderBy: { number: 'desc' },
      select: { number: true, summary: true, risks: true },
    });
    const usernames = m.participants.map((p) => p.user.profile?.username ?? p.userId);
    const prompt = meetingQuestionsPrompt({
      kind: m.kind,
      number: m.number,
      project: this.snapshot.promptBlock(snap),
      memory: await this.memory.promptBlock(m.projectId),
      lastMeeting: last ? `Check-in #${last.number}: ${last.summary ?? ''}\nRisks: ${last.risks.join('; ')}` : null,
      usernames,
    });
    const result = await this.ai.generateStructured({
      purpose: 'pm.meeting.questions',
      tier: m.kind === 'CHECK_IN' ? 'fast' : undefined,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: MeetingQuestionsSchema,
      maxTokens: 6000,
    });
    const want = m.kind === 'CHECK_IN' ? CHECK_IN_QUESTIONS : FINAL_REVIEW_QUESTIONS;
    const fallback = m.kind === 'CHECK_IN' ? DEFAULT_CHECK_IN : DEFAULT_FINAL_REVIEW;
    const byUser = new Map(result.value.participants.map((p) => [p.username.replace(/^@/, '').toLowerCase(), p]));

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.projectMeeting.updateMany({
        where: { id: meetingId, status: MeetingStatus.PREPARING },
        data: {
          status: MeetingStatus.OPEN,
          agenda: result.value.agenda.trim(),
          opensAt: new Date(),
          closesAt: new Date(Date.now() + WINDOW_HOURS[m.kind] * 3_600_000),
        },
      });
      if (claimed.count !== 1) return;
      for (const p of m.participants) {
        const name = (p.user.profile?.username ?? '').toLowerCase();
        const qs = (byUser.get(name)?.questions ?? fallback).slice(0, want);
        const padded = [...qs, ...fallback.slice(qs.length, want)];
        await tx.meetingQuestion.createMany({
          data: padded.map((prompt, i) => ({ participantId: p.id, position: i + 1, prompt: prompt.trim() })),
        });
      }
    });
    const closes = new Date(Date.now() + WINDOW_HOURS[m.kind] * 3_600_000);
    const title = m.kind === 'CHECK_IN' ? `Check-in #${m.number}` : 'The final review';
    await this.chat.postAsAi(
      m.projectId,
      `${title} is open until ${closes.toUTCString().slice(0, 22)} UTC. ${result.value.agenda.trim()}\n\nEach of you has ${want} questions. Answer out loud or in writing from the Meetings tab.`,
      { type: 'meeting', id: meetingId },
    );
    await this.activity.record({
      projectId: m.projectId,
      type: 'MEETING_OPENED',
      actorKind: 'AGENT',
      summary: `opened ${title.toLowerCase()}`,
    });
    this.notify(m.projectId, meetingId);
  }

  // ───────── members answer ─────────

  async answer(user: AuthUser, meetingId: string, position: number, answer: string, viaVoice: boolean) {
    const p = await this.prisma.meetingParticipant.findUnique({
      where: { meetingId_userId: { meetingId, userId: user.id } },
      include: { meeting: { select: { status: true, projectId: true, closesAt: true } }, questions: true },
    });
    if (!p) throw notFound('Meeting');
    if (p.meeting.status !== MeetingStatus.OPEN || p.meeting.closesAt <= new Date()) {
      throw new DomainError(
        ErrorCode.MEETING_NOT_OPEN,
        'This meeting is no longer taking answers.',
        HttpStatus.CONFLICT,
      );
    }
    const q = p.questions.find((x) => x.position === position);
    if (!q) throw notFound('Question');
    await this.prisma.meetingQuestion.update({
      where: { id: q.id },
      data: { answer: answer.trim(), viaVoice, answeredAt: new Date() },
    });
    const done = p.questions.every((x) => (x.id === q.id ? true : !!x.answer?.trim()));
    if (done && p.status !== ParticipantStatus.ANSWERED) {
      await this.prisma.meetingParticipant.update({
        where: { id: p.id },
        data: { status: ParticipantStatus.ANSWERED, answeredAt: new Date() },
      });
      // Everyone has answered: no need to wait for the window to close.
      const pending = await this.prisma.meetingParticipant.count({
        where: { meetingId, status: ParticipantStatus.PENDING },
      });
      if (!pending) await this.beginSummary(meetingId);
    }
    this.notify(p.meeting.projectId, meetingId);
    return this.view(user, meetingId);
  }

  private async beginSummary(meetingId: string): Promise<boolean> {
    const claimed = await this.prisma.projectMeeting.updateMany({
      where: { id: meetingId, status: MeetingStatus.OPEN },
      data: { status: MeetingStatus.SUMMARIZING },
    });
    if (claimed.count !== 1) return false;
    await this.queue.add(JOB_MEETING_SUMMARIZE, { meetingId }, { jobId: `${JOB_MEETING_SUMMARIZE}-${meetingId}` });
    return true;
  }

  // ───────── worker: summarize ─────────

  async summarize(meetingId: string): Promise<void> {
    const m = await this.prisma.projectMeeting.findUnique({ where: { id: meetingId }, include: viewInclude });
    if (!m || m.status !== MeetingStatus.SUMMARIZING) return;
    const snap = await this.snapshot.load(m.projectId);
    const transcript: MeetingTranscript[] = m.participants.map((p) => ({
      username: p.user.profile?.username ?? p.userId,
      displayName: p.user.profile?.displayName ?? 'Member',
      answered: p.questions.some((q) => !!q.answer?.trim()),
      qa: p.questions.map((q) => ({ question: q.prompt, answer: q.answer, viaVoice: q.viaVoice })),
    }));
    const prompt = meetingSummaryPrompt({
      kind: m.kind,
      number: m.number,
      project: this.snapshot.promptBlock(snap),
      memory: await this.memory.promptBlock(m.projectId),
      agenda: m.agenda,
      transcript,
    });
    const result = await this.ai.generateStructured({
      purpose: 'pm.meeting.summary',
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: MeetingSummarySchema,
      effort: 'medium',
      maxTokens: 8000,
    });
    const v = result.value;
    const idByUsername = new Map(
      m.participants.map((p) => [(p.user.profile?.username ?? '').toLowerCase(), p.userId] as const),
    );
    const noteFor = new Map(v.members.map((x) => [x.username.replace(/^@/, '').toLowerCase(), x.note.trim()]));

    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.projectMeeting.updateMany({
        where: { id: meetingId, status: MeetingStatus.SUMMARIZING },
        data: {
          status: MeetingStatus.CLOSED,
          summary: v.summary.trim(),
          highlights: v.highlights.map((x) => x.trim()),
          risks: v.risks.map((x) => x.trim()),
          summarizedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return false;
      for (const p of m.participants) {
        const answered = p.questions.some((q) => !!q.answer?.trim());
        await tx.meetingParticipant.update({
          where: { id: p.id },
          data: {
            status: answered ? (p.status === 'PENDING' ? 'ANSWERED' : p.status) : ParticipantStatus.MISSED,
            aiNote: noteFor.get((p.user.profile?.username ?? '').toLowerCase()) ?? null,
          },
        });
      }
      await this.memory.write(
        m.projectId,
        {
          kind: 'SUMMARY',
          content: `${m.kind === 'CHECK_IN' ? `Check-in #${m.number}` : 'Final review'}: ${v.summary}`,
        },
        { type: 'MEETING', id: meetingId },
        tx,
      );
      // The meeting summary is saved above; skip any SUMMARY the model adds so it isn't stored twice.
      for (const e of v.memory.filter((x) => x.kind !== 'SUMMARY')) {
        // Only members of this meeting can be the subject of a note; unknown names drop the link.
        const subject = e.about_username ? idByUsername.get(e.about_username.replace(/^@/, '').toLowerCase()) : null;
        await this.memory.write(
          m.projectId,
          { kind: e.kind, content: e.content, subjectUserId: subject ?? null },
          { type: 'MEETING', id: meetingId },
          tx,
        );
      }
      return true;
    });
    if (!done) return;

    const title = m.kind === 'CHECK_IN' ? `Check-in #${m.number}` : 'Final review';
    const missed = transcript.filter((t) => !t.answered).map((t) => t.displayName);
    await this.chat.postAsAi(
      m.projectId,
      `${title} summary: ${v.summary.trim()}${
        v.risks.length ? `\n\nRisks: ${v.risks.join(' · ')}` : ''
      }${missed.length ? `\n\nDidn’t answer: ${missed.join(', ')}.` : ''}`,
      { type: 'meeting', id: meetingId },
    );
    await this.activity.record({
      projectId: m.projectId,
      type: 'MEETING_SUMMARIZED',
      actorKind: 'AGENT',
      summary: `summarized ${title.toLowerCase()}`,
    });
    if (v.follow_ups.length) {
      await this.agent.startFromMeeting(
        m.projectId,
        meetingId,
        `Follow up on ${title.toLowerCase()}:\n${v.follow_ups.map((f) => `- ${f}`).join('\n')}`,
      );
    }
    this.notify(m.projectId, meetingId);
  }

  async markFailed(meetingId: string, jobName: string, error: unknown) {
    const reason =
      error instanceof AiError ? `${error.kind}: ${error.message}` : String((error as Error)?.message ?? error);
    this.logger.warn(`Meeting ${meetingId} ${jobName} failed: ${reason}`);
    const from = jobName === JOB_MEETING_PREPARE ? MeetingStatus.PREPARING : MeetingStatus.SUMMARIZING;
    const m = await this.prisma.projectMeeting.findUnique({ where: { id: meetingId }, select: { projectId: true } });
    await this.prisma.projectMeeting.updateMany({
      where: { id: meetingId, status: from },
      data: { status: MeetingStatus.FAILED, failureReason: `${jobName}: ${reason}`.slice(0, 500) },
    });
    if (m) this.notify(m.projectId, meetingId);
  }

  /** Retry a failed meeting from the step that failed. */
  async retry(user: AuthUser, meetingId: string): Promise<MeetingView> {
    const m = await this.prisma.projectMeeting.findUnique({ where: { id: meetingId } });
    if (!m) throw notFound('Meeting');
    await this.access.byId(user, m.projectId);
    if (m.status !== MeetingStatus.FAILED) {
      throw new DomainError(ErrorCode.MEETING_NOT_OPEN, 'Only a failed meeting can be retried.', HttpStatus.CONFLICT);
    }
    const prepare = m.failureReason?.startsWith(JOB_MEETING_PREPARE) ?? true;
    try {
      await this.prisma.projectMeeting.update({
        where: { id: meetingId },
        data: { status: prepare ? MeetingStatus.PREPARING : MeetingStatus.SUMMARIZING, failureReason: null },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new DomainError(ErrorCode.MEETING_IN_PROGRESS, 'Another meeting is in progress.', HttpStatus.CONFLICT);
      }
      throw e;
    }
    const job = prepare ? JOB_MEETING_PREPARE : JOB_MEETING_SUMMARIZE;
    await this.queue.add(job, { meetingId }, { jobId: `${job}-${meetingId}-retry-${Date.now()}` });
    this.notify(m.projectId, meetingId);
    return this.view(user, meetingId);
  }

  // ───────── views ─────────

  async list(user: AuthUser, projectId: string, limit = 20): Promise<MeetingSummary[]> {
    const rows = await this.prisma.projectMeeting.findMany({
      where: { projectId },
      orderBy: { number: 'desc' },
      take: limit,
      include: viewInclude,
    });
    return rows.map((r) => this.toSummary(r, user.id));
  }

  async view(user: AuthUser, meetingId: string): Promise<MeetingView> {
    const m = await this.prisma.projectMeeting.findUnique({ where: { id: meetingId }, include: viewInclude });
    if (!m) throw notFound('Meeting');
    await this.access.byId(user, m.projectId);
    return this.toView(m, user.id);
  }

  async nextCheckInAt(projectId: string): Promise<string | null> {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        status: true,
        aiPmEnabled: true,
        meetingIntervalDays: true,
        startsAt: true,
        team: { select: { formedAt: true } },
        meetings: { orderBy: { number: 'desc' }, take: 1, select: { opensAt: true, status: true } },
      },
    });
    if (!p || p.status !== ProjectStatus.IN_PROGRESS || !p.aiPmEnabled) return null;
    const last = p.meetings[0];
    if (last && OPEN_STATES.includes(last.status)) return null;
    const from = last?.opensAt ?? p.startsAt ?? p.team?.formedAt;
    if (!from) return null;
    const at = new Date(Math.max(from.getTime() + p.meetingIntervalDays * DAY, Date.now()));
    return at.toISOString();
  }

  toSummary(m: MeetingRow, userId: string): MeetingSummary {
    const mine = m.participants.find((p) => p.userId === userId);
    return {
      id: m.id,
      number: m.number,
      kind: m.kind,
      status: m.status,
      opensAt: m.opensAt.toISOString(),
      closesAt: m.closesAt.toISOString(),
      answered: m.participants.filter((p) => p.status === ParticipantStatus.ANSWERED).length,
      participants: m.participants.length,
      myStatus: mine?.status ?? null,
    };
  }

  private toView(m: MeetingRow, userId: string): MeetingView {
    const closed = m.status === MeetingStatus.CLOSED;
    return {
      ...this.toSummary(m, userId),
      project: m.project,
      agenda: m.agenda,
      summary: m.summary,
      highlights: m.highlights,
      risks: m.risks,
      failureMessage: m.status === MeetingStatus.FAILED ? 'The AI PM hit a problem running this meeting.' : null,
      people: m.participants.map((p) => ({
        user: toPerson(p.user),
        status: p.status,
        answeredAt: p.answeredAt?.toISOString() ?? null,
        aiNote: closed ? p.aiNote : null,
        // Your own answers always; teammates' answers once the meeting is summarized.
        questions:
          p.userId === userId || closed
            ? p.questions.map((q) => ({
                position: q.position,
                prompt: q.prompt,
                answer: q.answer,
                viaVoice: q.viaVoice,
              }))
            : null,
      })),
    };
  }

  private notify(projectId: string, meetingId: string) {
    this.realtime.emitToProject(projectId, RT_EVENTS.MEETING_UPDATED, { projectId, meetingId });
  }
}
