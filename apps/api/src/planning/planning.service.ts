import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { PlanStatus, type Prisma, SprintStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { PlanDraft, PlanProposalView } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { AiError, AiProvider } from '../ai/ai-provider';
import { ActivityService } from '../activity/activity.service';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { PLANNING_QUEUE } from '../queue/queue.module';
import { positionBetween } from '../tasks/task-rules';
import { WorkspaceAccess } from '../tasks/workspace-access.service';
import { PlanSchema, planPrompt, validatePlan } from './plan-ai';

export const JOB_PLAN = 'plan.generate';
const DAY = 86_400_000;

@Injectable()
export class PlanningService {
  private readonly logger = new Logger(PlanningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
    @InjectQueue(PLANNING_QUEUE) private readonly queue: Queue<{ proposalId: string }>,
  ) {}

  async request(user: AuthUser, slug: string): Promise<PlanProposalView> {
    const ctx = await this.access.bySlug(user, slug);
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'AI planning isn’t available on this server yet. You can still plan by hand.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    const busy = await this.prisma.projectPlanProposal.findFirst({
      where: { projectId: ctx.projectId, status: PlanStatus.GENERATING },
    });
    if (busy) return this.view(busy.id);
    const p = await this.prisma.projectPlanProposal.create({
      data: { projectId: ctx.projectId, createdById: user.id },
    });
    await this.queue.add(JOB_PLAN, { proposalId: p.id }, { jobId: `${JOB_PLAN}-${p.id}` });
    return this.view(p.id);
  }

  async latest(user: AuthUser, slug: string): Promise<PlanProposalView> {
    const ctx = await this.access.bySlug(user, slug);
    const p = await this.prisma.projectPlanProposal.findFirst({
      where: { projectId: ctx.projectId, status: { not: PlanStatus.DISCARDED } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!p) throw notFound('Plan');
    return this.view(p.id);
  }

  /** Worker step: generate, validate cross-references, store as a proposal. */
  async generate(proposalId: string): Promise<void> {
    const proposal = await this.prisma.projectPlanProposal.findUnique({ where: { id: proposalId } });
    if (!proposal || proposal.status !== PlanStatus.GENERATING) return;
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: proposal.projectId },
      include: {
        roles: { include: { requiredSkills: { include: { skill: { select: { name: true } } } } } },
        techStack: { include: { skill: { select: { name: true } } } },
        tasks: { select: { title: true }, take: 100 },
      },
    });
    const prompt = planPrompt({
      title: project.title,
      problem: project.problem,
      description: project.description,
      difficulty: project.difficulty.toLowerCase(),
      durationWeeks: project.durationWeeks,
      roles: project.roles.map((r) => ({
        key: r.key,
        title: r.title,
        description: r.description,
        seats: r.seats,
        skills: r.requiredSkills.map((s) => s.skill.name),
      })),
      techStack: project.techStack.map((t) => t.skill.name),
      existingTasks: project.tasks.map((t) => t.title),
    });
    const result = await this.ai.generateStructured({
      purpose: 'project.plan',
      userId: proposal.createdById,
      system: prompt.system,
      messages: [{ role: 'user', content: prompt.user }],
      schema: PlanSchema,
      effort: 'high',
      maxTokens: 16000,
    });
    const problems = validatePlan(result.value, new Set(project.roles.map((r) => r.key)));
    // Invalid cross-references are treated like malformed output: retried, then FAILED.
    if (problems.length)
      throw new AiError('INVALID_OUTPUT', `Plan failed validation: ${problems.slice(0, 3).join(' ')}`);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.projectPlanProposal.updateMany({
        where: { id: proposalId, status: PlanStatus.GENERATING },
        data: {
          status: PlanStatus.PROPOSED,
          plan: result.value as unknown as Prisma.InputJsonValue,
          aiModel: result.model,
        },
      });
      if (claimed.count !== 1) return;
      await this.activity.record(
        {
          projectId: proposal.projectId,
          type: 'PLAN_PROPOSED',
          actorKind: 'AGENT',
          summary: `AI PM proposed a plan: ${result.value.tasks.length} tasks across ${result.value.sprints.length} sprints. Waiting for approval.`,
        },
        tx,
      );
    });
  }

  async markFailed(proposalId: string, error: unknown) {
    const reason =
      error instanceof AiError ? `${error.kind}: ${error.message}` : String((error as Error)?.message ?? error);
    this.logger.warn(`Plan ${proposalId} failed: ${reason}`);
    await this.prisma.projectPlanProposal.updateMany({
      where: { id: proposalId, status: PlanStatus.GENERATING },
      data: { status: PlanStatus.FAILED, failureReason: reason.slice(0, 500) },
    });
  }

  /**
   * Approval: turns the validated draft into real milestones, sprints, tasks and dependencies,
   * appended after anything that already exists. One transaction; tasks are marked AI suggested.
   */
  async apply(user: AuthUser, proposalId: string): Promise<PlanProposalView> {
    const proposal = await this.prisma.projectPlanProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw notFound('Plan');
    const ctx = await this.access.byId(user, proposal.projectId);
    const plan = proposal.plan as unknown as PlanDraft | null;
    if (proposal.status !== PlanStatus.PROPOSED || !plan) {
      throw new DomainError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        'Only a proposed plan can be applied.',
        HttpStatus.CONFLICT,
      );
    }
    const roles = await this.prisma.projectRole.findMany({
      where: { projectId: ctx.projectId },
      select: { id: true, key: true },
    });
    const problems = validatePlan(plan, new Set(roles.map((r) => r.key)));
    if (problems.length)
      throw new DomainError(
        ErrorCode.PLAN_INVALID,
        `This plan no longer fits the project: ${problems[0]}`,
        HttpStatus.CONFLICT,
      );
    const roleId = new Map(roles.map((r) => [r.key, r.id]));

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.projectPlanProposal.updateMany({
        where: { id: proposalId, status: PlanStatus.PROPOSED },
        data: { status: PlanStatus.APPLIED, decidedById: user.id, decidedAt: new Date() },
      });
      if (claimed.count !== 1)
        throw new DomainError(
          ErrorCode.INVALID_STATUS_TRANSITION,
          'This plan was already decided.',
          HttpStatus.CONFLICT,
        );
      await tx.$queryRaw`SELECT 1 FROM "Project" WHERE "id" = ${ctx.projectId}::uuid FOR UPDATE`;

      const now = Date.now();
      const lastMilestone = await tx.milestone.findFirst({
        where: { projectId: ctx.projectId },
        orderBy: { position: 'desc' },
      });
      await tx.milestone.createMany({
        data: plan.milestones.map((m, i) => ({
          projectId: ctx.projectId,
          position: (lastMilestone?.position ?? 0) + i + 1,
          title: m.title,
          dueDate: new Date(now + m.dueInDays * DAY),
        })),
      });

      const lastSprint = await tx.sprint.findFirst({
        where: { projectId: ctx.projectId },
        orderBy: { number: 'desc' },
      });
      let start = Math.max(now, lastSprint?.endsAt.getTime() ?? 0);
      const sprintIds = new Map<number, string>();
      for (const s of [...plan.sprints].sort((a, b) => a.number - b.number)) {
        const created = await tx.sprint.create({
          data: {
            projectId: ctx.projectId,
            number: (lastSprint?.number ?? 0) + s.number,
            goal: s.goal,
            startsAt: new Date(start),
            endsAt: new Date(start + s.durationDays * DAY),
            status: SprintStatus.PLANNED,
          },
        });
        sprintIds.set(s.number, created.id);
        start += s.durationDays * DAY;
      }

      const [{ max }] = await tx.$queryRaw<
        { max: number | null }[]
      >`SELECT MAX("number") AS max FROM "Task" WHERE "projectId" = ${ctx.projectId}::uuid`;
      let next = (max ?? 0) + 1;
      let pos = positionBetween(null, null);
      const ids = new Map<string, string>();
      for (const t of plan.tasks) {
        const created = await tx.task.create({
          data: {
            projectId: ctx.projectId,
            number: next++,
            title: t.title,
            description: t.description,
            acceptanceCriteria: t.acceptanceCriteria,
            roleId: t.roleKey ? roleId.get(t.roleKey) : null,
            estimate: t.estimate,
            priority: t.priority,
            sprintId: sprintIds.get(t.sprintNumber),
            status: t.sprintNumber === 1 ? 'TODO' : 'BACKLOG',
            aiSuggested: true,
            position: (pos += 1024),
            createdById: user.id,
          },
        });
        ids.set(t.key, created.id);
      }
      await tx.taskDependency.createMany({
        data: plan.tasks.flatMap((t) =>
          t.dependsOn.map((d) => ({ taskId: ids.get(t.key)!, dependsOnId: ids.get(d)! })),
        ),
      });
      await this.activity.record(
        {
          projectId: ctx.projectId,
          type: 'PLAN_APPLIED',
          actorUserId: user.id,
          summary: `approved the AI PM plan: created ${plan.tasks.length} tasks, ${plan.sprints.length} sprints and ${plan.milestones.length} milestones`,
        },
        tx,
      );
    });
    return this.view(proposalId);
  }

  async discard(user: AuthUser, proposalId: string): Promise<PlanProposalView> {
    const proposal = await this.prisma.projectPlanProposal.findUnique({ where: { id: proposalId } });
    if (!proposal) throw notFound('Plan');
    await this.access.byId(user, proposal.projectId);
    const done = await this.prisma.projectPlanProposal.updateMany({
      where: { id: proposalId, status: { in: [PlanStatus.PROPOSED, PlanStatus.FAILED] } },
      data: { status: PlanStatus.DISCARDED, decidedById: user.id, decidedAt: new Date() },
    });
    if (done.count !== 1)
      throw new DomainError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        'This plan can’t be discarded now.',
        HttpStatus.CONFLICT,
      );
    await this.activity.record({
      projectId: proposal.projectId,
      type: 'PLAN_DISCARDED',
      actorUserId: user.id,
      summary: 'rejected the AI PM plan',
    });
    return this.view(proposalId);
  }

  private async view(id: string): Promise<PlanProposalView> {
    const p = await this.prisma.projectPlanProposal.findUniqueOrThrow({ where: { id } });
    return {
      id: p.id,
      status: p.status,
      plan: (p.plan as unknown as PlanDraft | null) ?? null,
      failureMessage:
        p.status === PlanStatus.FAILED
          ? 'The AI PM couldn’t produce a valid plan. You can try again or plan by hand.'
          : null,
      createdAt: p.createdAt.toISOString(),
      decidedAt: p.decidedAt?.toISOString() ?? null,
    };
  }
}
