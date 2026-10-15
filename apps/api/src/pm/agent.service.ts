import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AgentRunStatus, type AgentRunTrigger, Prisma, ToolCallStatus } from '@prisma/client';
import { ErrorCode, RT_EVENTS } from '@studywidbuddy/shared';
import type { AgentRunSummary, AgentRunView, AgentToolCallView, PendingApproval } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { ActivityService } from '../activity/activity.service';
import { type AiContentBlock, AiError, type AiMessage, AiProvider } from '../ai/ai-provider';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { PM_QUEUE } from '../queue/queue.module';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { WorkspaceAccess } from '../tasks/workspace-access.service';
import { MemoryService } from './memory.service';
import { agentSystemPrompt, MAX_AGENT_STEPS, MAX_PROPOSALS, MAX_TOOL_CALLS } from './pm-ai';
import { ProjectSnapshotService } from './project-snapshot.service';
import { ToolInputError, ToolRegistry } from './tool-registry';

export const JOB_AGENT_RUN = 'agent.run';
/** Manual runs per project per day: keeps cost predictable. */
export const MANUAL_RUNS_PER_DAY = 10;

const callInclude = {
  result: true,
  decidedBy: { select: personSelect },
} satisfies Prisma.AgentToolCallInclude;
type CallRow = Prisma.AgentToolCallGetPayload<{ include: typeof callInclude }>;

const runInclude = {
  requestedBy: { select: personSelect },
  _count: { select: { toolCalls: { where: { status: ToolCallStatus.PROPOSED } } } },
} satisfies Prisma.AgentRunInclude;
type RunRow = Prisma.AgentRunGetPayload<{ include: typeof runInclude }>;

/** Results go back to the model as JSON text, capped so one big read can't flood the context. */
const RESULT_CHARS = 12_000;
const asResultText = (v: unknown) => {
  const s = JSON.stringify(v);
  return s.length > RESULT_CHARS ? `${s.slice(0, RESULT_CHARS)}… (truncated)` : s;
};

/**
 * The AI PM agent. A run is a bounded tool-use loop: the model reads the project, may write
 * low-risk things (memory, chat, comments) and may *propose* task changes. Every step, tool
 * call and result is persisted, so the team can see exactly what the agent did and why.
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly tools: ToolRegistry,
    private readonly memory: MemoryService,
    private readonly snapshot: ProjectSnapshotService,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
    private readonly realtime: RealtimeGateway,
    @InjectQueue(PM_QUEUE) private readonly queue: Queue,
  ) {}

  // ───────── starting runs ─────────

  async startManual(user: AuthUser, slug: string, goal?: string): Promise<AgentRunSummary> {
    const ctx = await this.access.bySlug(user, slug);
    this.assertConfigured();
    const since = new Date(Date.now() - 86_400_000);
    const today = await this.prisma.agentRun.count({
      where: { projectId: ctx.projectId, trigger: 'MANUAL', createdAt: { gte: since } },
    });
    if (today >= MANUAL_RUNS_PER_DAY) {
      throw new DomainError(
        ErrorCode.AGENT_LIMIT_REACHED,
        `The AI PM has already run ${MANUAL_RUNS_PER_DAY} times today for this project. Try again tomorrow.`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    const busy = await this.prisma.agentRun.findFirst({
      where: { projectId: ctx.projectId, status: { in: [AgentRunStatus.QUEUED, AgentRunStatus.RUNNING] } },
      include: runInclude,
    });
    if (busy) return this.toSummary(busy);
    const run = await this.create(
      ctx.projectId,
      'MANUAL',
      goal?.trim() || 'Review the project: progress, blockers, workload balance and risks. Act where it helps.',
      { requestedById: user.id },
    );
    return this.toSummary(run);
  }

  /** Used after a meeting summary. */
  async startFromMeeting(projectId: string, meetingId: string, goal: string) {
    if (!this.ai.isConfigured()) return null;
    return this.create(projectId, 'MEETING_SUMMARY', goal, { meetingId });
  }

  private async create(
    projectId: string,
    trigger: AgentRunTrigger,
    goal: string,
    extra: { requestedById?: string; meetingId?: string },
  ) {
    const run = await this.prisma.agentRun.create({
      data: { projectId, trigger, goal: goal.slice(0, 2000), ...extra },
      include: runInclude,
    });
    await this.queue.add(JOB_AGENT_RUN, { runId: run.id }, { jobId: `${JOB_AGENT_RUN}-${run.id}`, attempts: 1 });
    this.notify(projectId, run.id);
    return run;
  }

  // ───────── the loop (worker) ─────────

  async execute(runId: string): Promise<void> {
    const claimed = await this.prisma.agentRun.updateMany({
      where: { id: runId, status: AgentRunStatus.QUEUED },
      data: { status: AgentRunStatus.RUNNING, startedAt: new Date() },
    });
    if (claimed.count !== 1) return;
    const run = await this.prisma.agentRun.findUniqueOrThrow({
      where: { id: runId },
      include: { project: { select: { slug: true } } },
    });
    this.notify(run.projectId, runId);

    try {
      const snap = await this.snapshot.load(run.projectId);
      const system = agentSystemPrompt(this.snapshot.promptBlock(snap), await this.memory.promptBlock(run.projectId));
      const messages: AiMessage[] = [{ role: 'user', content: `Your task for this run: ${run.goal}` }];
      const definitions = this.tools.definitions();
      let calls = 0;
      let proposals = 0;
      let finalText: string | null = null;
      let model: string | null = null;
      let usage = { in: 0, out: 0 };

      for (let index = 0; index < MAX_AGENT_STEPS; index++) {
        const res = await this.ai.toolCall({
          purpose: 'pm.agent',
          system,
          messages,
          tools: definitions,
          effort: 'medium',
          maxTokens: 4000,
        });
        model = res.model;
        usage = { in: usage.in + res.usage.inputTokens, out: usage.out + res.usage.outputTokens };
        const step = await this.prisma.agentStep.create({
          data: { runId, index, text: res.text.trim() || null },
        });
        if (!res.toolCalls.length) {
          finalText = res.text.trim() || null;
          break;
        }

        const assistant: AiContentBlock[] = [];
        if (res.text.trim()) assistant.push({ type: 'text', text: res.text });
        const results: AiContentBlock[] = [];
        for (const call of res.toolCalls) {
          assistant.push({ type: 'tool_use', id: call.id, name: call.name, input: call.input });
          const out = await this.handleCall(run.projectId, run.project.slug, runId, step.id, call, {
            overCallLimit: ++calls > MAX_TOOL_CALLS,
            overProposalLimit: proposals >= MAX_PROPOSALS,
          });
          if (out.proposed) proposals++;
          results.push({ type: 'tool_result', tool_use_id: call.id, content: out.text, is_error: out.error });
        }
        messages.push({ role: 'assistant', content: assistant }, { role: 'user', content: results });
        this.notify(run.projectId, runId);
        if (index === MAX_AGENT_STEPS - 1) {
          finalText = `Stopped after ${MAX_AGENT_STEPS} steps (the per-run limit).`;
        }
      }

      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.COMPLETED,
          finishedAt: new Date(),
          summary: finalText?.slice(0, 4000) ?? null,
          model,
          inputTokens: usage.in,
          outputTokens: usage.out,
        },
      });
    } catch (e) {
      const msg = e instanceof AiError ? `${e.kind}: ${e.message}` : (e as Error).message;
      this.logger.warn(`Agent run ${runId} failed: ${msg}`);
      await this.prisma.agentRun.update({
        where: { id: runId },
        data: {
          status: AgentRunStatus.FAILED,
          finishedAt: new Date(),
          error:
            e instanceof AiError && e.kind !== 'FATAL'
              ? 'The AI was unavailable. Try again shortly.'
              : 'The run hit an unexpected problem.',
        },
      });
    }
    this.notify(run.projectId, runId);
  }

  private async handleCall(
    projectId: string,
    slug: string,
    runId: string,
    stepId: string,
    call: { id: string; name: string; input: unknown },
    limits: { overCallLimit: boolean; overProposalLimit: boolean },
  ): Promise<{ text: string; error: boolean; proposed: boolean }> {
    const tool = this.tools.get(call.name);
    const parsed = this.tools.parse(call.name, call.input);
    const base = {
      runId,
      stepId,
      toolUseId: call.id,
      tool: call.name.slice(0, 60),
      input: (call.input ?? {}) as Prisma.InputJsonValue,
      risk: tool?.risk ?? 'READ',
    };
    const fail = async (error: string) => {
      await this.prisma.agentToolCall.create({
        data: {
          ...base,
          status: ToolCallStatus.FAILED,
          result: { create: { ok: false, output: { error } } },
        },
      });
      return { text: `Error: ${error}`, error: true, proposed: false };
    };

    if (limits.overCallLimit) return fail(`Tool call limit (${MAX_TOOL_CALLS}) reached for this run. Finish up.`);
    if (!tool || !parsed.ok) return fail(parsed.ok ? `Unknown tool "${call.name}".` : parsed.error);

    if (tool.risk === 'NEEDS_APPROVAL') {
      if (limits.overProposalLimit) return fail(`Proposal limit (${MAX_PROPOSALS}) reached for this run.`);
      const c = await this.prisma.agentToolCall.create({
        data: { ...base, input: parsed.value as Prisma.InputJsonValue, status: ToolCallStatus.PROPOSED },
      });
      return {
        text: JSON.stringify({
          status: 'proposed',
          proposal_id: c.id,
          note: 'Waiting for a team member to approve. It has NOT happened yet.',
        }),
        error: false,
        proposed: true,
      };
    }

    try {
      const output = await this.tools.execute({ projectId, slug, runId }, call.name, parsed.value);
      await this.prisma.agentToolCall.create({
        data: {
          ...base,
          input: parsed.value as Prisma.InputJsonValue,
          status: ToolCallStatus.EXECUTED,
          result: { create: { ok: true, output: (output ?? null) as Prisma.InputJsonValue } },
        },
      });
      return { text: asResultText(output), error: false, proposed: false };
    } catch (e) {
      if (e instanceof ToolInputError) return fail(e.message);
      if (e instanceof DomainError) return fail(e.message);
      throw e;
    }
  }

  // ───────── approvals ─────────

  async approvals(projectId: string): Promise<PendingApproval[]> {
    const rows = await this.prisma.agentToolCall.findMany({
      where: { status: ToolCallStatus.PROPOSED, run: { projectId } },
      orderBy: { createdAt: 'asc' },
      include: { ...callInclude, run: { select: { goal: true } } },
    });
    return rows.map((r) => ({ ...this.toCall(r), runId: r.runId, runGoal: r.run.goal }));
  }

  /** Approve: execute the proposal now, under the approver's identity and permissions. */
  async approve(user: AuthUser, callId: string): Promise<AgentToolCallView> {
    const { call, ctx } = await this.pending(user, callId);
    const claimed = await this.prisma.agentToolCall.updateMany({
      where: { id: callId, status: ToolCallStatus.PROPOSED },
      data: { status: ToolCallStatus.APPROVED, decidedById: user.id, decidedAt: new Date() },
    });
    if (claimed.count !== 1) throw this.notPending();

    let ok = true;
    let output: unknown;
    try {
      output = await this.tools.execute(
        { projectId: ctx.projectId, slug: ctx.slug, runId: call.runId, approver: user },
        call.tool,
        call.input,
      );
    } catch (e) {
      if (!(e instanceof ToolInputError || e instanceof DomainError)) throw e;
      ok = false;
      output = { error: e.message };
    }
    await this.prisma.agentToolCall.update({
      where: { id: callId },
      data: {
        status: ok ? ToolCallStatus.EXECUTED : ToolCallStatus.FAILED,
        result: { create: { ok, output: (output ?? null) as Prisma.InputJsonValue } },
      },
    });
    const label = this.tools.parse(call.tool, call.input);
    await this.activity.record({
      projectId: ctx.projectId,
      type: 'AGENT_ACTION_APPROVED',
      actorUserId: user.id,
      summary: `approved an AI PM proposal: ${label.ok ? label.label : call.tool}${ok ? '' : ' (it failed)'}`,
    });
    this.notify(ctx.projectId, call.runId);
    return this.callView(callId);
  }

  async reject(user: AuthUser, callId: string): Promise<AgentToolCallView> {
    const { call, ctx } = await this.pending(user, callId);
    const claimed = await this.prisma.agentToolCall.updateMany({
      where: { id: callId, status: ToolCallStatus.PROPOSED },
      data: { status: ToolCallStatus.REJECTED, decidedById: user.id, decidedAt: new Date() },
    });
    if (claimed.count !== 1) throw this.notPending();
    const label = this.tools.parse(call.tool, call.input);
    await this.activity.record({
      projectId: ctx.projectId,
      type: 'AGENT_ACTION_REJECTED',
      actorUserId: user.id,
      summary: `rejected an AI PM proposal: ${label.ok ? label.label : call.tool}`,
    });
    this.notify(ctx.projectId, call.runId);
    return this.callView(callId);
  }

  private async pending(user: AuthUser, callId: string) {
    const call = await this.prisma.agentToolCall.findUnique({
      where: { id: callId },
      include: { run: { select: { projectId: true } } },
    });
    if (!call) throw notFound('Proposal');
    // Membership check throws 403 for non-members; approvals need an active member (or admin).
    const ctx = await this.access.byId(user, call.run.projectId);
    if (call.status !== ToolCallStatus.PROPOSED) throw this.notPending();
    return { call, ctx };
  }

  private notPending() {
    return new DomainError(ErrorCode.APPROVAL_NOT_PENDING, 'This proposal was already decided.', HttpStatus.CONFLICT);
  }

  // ───────── views ─────────

  async runs(projectId: string, limit = 15): Promise<AgentRunSummary[]> {
    const rows = await this.prisma.agentRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: runInclude,
    });
    return rows.map((r) => this.toSummary(r));
  }

  async run(user: AuthUser, runId: string): Promise<AgentRunView> {
    const r = await this.prisma.agentRun.findUnique({
      where: { id: runId },
      include: {
        ...runInclude,
        steps: {
          orderBy: { index: 'asc' },
          include: { toolCalls: { orderBy: { createdAt: 'asc' }, include: callInclude } },
        },
      },
    });
    if (!r) throw notFound('Run');
    await this.access.byId(user, r.projectId);
    return {
      ...this.toSummary(r),
      model: r.model,
      steps: r.steps.map((s) => ({ index: s.index, text: s.text, toolCalls: s.toolCalls.map((c) => this.toCall(c)) })),
    };
  }

  private async callView(id: string) {
    return this.toCall(await this.prisma.agentToolCall.findUniqueOrThrow({ where: { id }, include: callInclude }));
  }

  private toCall(c: CallRow): AgentToolCallView {
    const parsed = this.tools.parse(c.tool, c.input);
    return {
      id: c.id,
      tool: c.tool,
      label: parsed.ok ? parsed.label : c.tool,
      input: c.input,
      risk: c.risk,
      status: c.status,
      result: c.result ? { ok: c.result.ok, output: c.result.output } : null,
      decidedBy: c.decidedBy ? toPerson(c.decidedBy) : null,
      decidedAt: c.decidedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
    };
  }

  private toSummary(r: RunRow): AgentRunSummary {
    return {
      id: r.id,
      trigger: r.trigger,
      status: r.status,
      goal: r.goal,
      summary: r.summary,
      error: r.error,
      requestedBy: r.requestedBy ? toPerson(r.requestedBy) : null,
      meetingId: r.meetingId,
      pendingApprovals: r._count.toolCalls,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    };
  }

  private assertConfigured() {
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'The AI PM isn’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private notify(projectId: string, runId: string) {
    this.realtime.emitToProject(projectId, RT_EVENTS.AGENT_UPDATED, { projectId, runId });
  }
}
