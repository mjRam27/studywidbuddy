import { Injectable } from '@nestjs/common';
import { type MemoryKind, TeamMemberStatus, type ToolRisk } from '@prisma/client';
import { STORY_POINTS } from '@studywidbuddy/shared';
import { z } from 'zod/v4';
import type { AiToolDefinition } from '../ai/ai-provider';
import { ActivityService } from '../activity/activity.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../common/prisma/prisma.service';
import { TasksService } from '../tasks/tasks.service';
import { MemoryService } from './memory.service';
import { ProjectSnapshotService } from './project-snapshot.service';

/**
 * Tools the AI PM may call. Each has a risk level:
 * - READ: runs immediately, changes nothing.
 * - WRITE_LOW: runs immediately and is logged (its own memory, chat posts, task comments).
 * - NEEDS_APPROVAL: stored as a proposal; runs only when a team member approves it, under
 *   that member's identity and permissions.
 * Inputs are validated with zod before anything runs; every reference is resolved inside
 * the run's project only.
 */

export interface ToolContext {
  projectId: string;
  slug: string;
  runId: string;
  /** Set when executing an approved proposal: the member who approved it. */
  approver?: AuthUser;
}

export class ToolInputError extends Error {}

interface ToolDef<S extends z.ZodType> {
  name: string;
  description: string;
  risk: ToolRisk;
  schema: S;
  label: (input: z.infer<S>) => string;
  run: (ctx: ToolContext, input: z.infer<S>) => Promise<unknown>;
}

const taskKeyField = z.string().regex(/^TASK-\d{1,6}$/, 'Use a task key like TASK-12');
const username = z.string().min(1).max(40);
const MEMORY_KINDS = ['FACT', 'DECISION', 'RISK', 'MEMBER_NOTE', 'SUMMARY'] as const;

@Injectable()
export class ToolRegistry {
  private readonly tools = new Map<string, ToolDef<z.ZodType>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly snapshot: ProjectSnapshotService,
    private readonly memory: MemoryService,
    private readonly chat: ChatService,
    private readonly tasks: TasksService,
    private readonly activity: ActivityService,
  ) {
    this.register({
      name: 'get_board',
      description: 'List the project tasks with status, assignee, estimate, blockers and due dates.',
      risk: 'READ',
      schema: z.object({ include_done: z.boolean().optional() }),
      label: () => 'Read the board',
      run: async (ctx, i) => {
        const s = await this.snapshot.load(ctx.projectId);
        return s.tasks
          .filter((t) => i.include_done || t.status !== 'DONE')
          .map(({ id: _id, updatedAt: _u, ...t }) => t);
      },
    });
    this.register({
      name: 'get_team',
      description: 'List active team members with role and current open work.',
      risk: 'READ',
      schema: z.object({}),
      label: () => 'Read the team',
      run: async (ctx) => {
        const s = await this.snapshot.load(ctx.projectId);
        return s.members.map((m) => {
          const open = s.tasks.filter((t) => t.assignee === m.username && t.status !== 'DONE');
          return {
            username: m.username,
            name: m.displayName,
            role: m.role,
            role_key: m.roleKey,
            open_points: open.reduce((n, t) => n + t.estimate, 0),
            open_tasks: open.map((t) => `${t.key} (${t.status})`),
          };
        });
      },
    });
    this.register({
      name: 'get_task',
      description: 'Read one task in full: description, acceptance criteria, dependencies and recent comments.',
      risk: 'READ',
      schema: z.object({ key: taskKeyField }),
      label: (i) => `Read ${i.key}`,
      run: async (ctx, i) => {
        const t = await this.prisma.task.findFirst({
          where: { projectId: ctx.projectId, number: Number(i.key.slice(5)) },
          include: {
            assignee: { select: { profile: { select: { username: true } } } },
            dependsOn: { include: { dependsOn: { select: { number: true, status: true } } } },
            comments: {
              orderBy: { createdAt: 'desc' },
              take: 5,
              include: { author: { select: { profile: { select: { username: true } } } } },
            },
          },
        });
        if (!t) throw new ToolInputError(`${i.key} does not exist in this project.`);
        return {
          key: i.key,
          title: t.title,
          status: t.status,
          description: t.description,
          acceptance_criteria: t.acceptanceCriteria,
          assignee: t.assignee?.profile?.username ?? null,
          depends_on: t.dependsOn.map((d) => `TASK-${d.dependsOn.number} (${d.dependsOn.status})`),
          recent_comments: t.comments.map((c) => `@${c.author.profile?.username}: ${c.body.slice(0, 300)}`),
        };
      },
    });
    this.register({
      name: 'get_recent_activity',
      description: 'Read the most recent events on the project timeline.',
      risk: 'READ',
      schema: z.object({ limit: z.number().int().min(1).max(30).optional() }),
      label: () => 'Read recent activity',
      run: async (ctx, i) => {
        const page = await this.activity.list(ctx.projectId, { limit: i.limit ?? 15 });
        return page.items.map((a) => ({
          at: a.createdAt.slice(0, 16),
          who: a.actor?.username ?? a.actorKind.toLowerCase(),
          what: a.summary,
        }));
      },
    });
    this.register({
      name: 'get_memory',
      description: 'Read your own memory for this project (older entries than the ones in your instructions).',
      risk: 'READ',
      schema: z.object({ kind: z.enum(MEMORY_KINDS).optional() }),
      label: () => 'Read project memory',
      run: async (ctx, i) =>
        (await this.memory.list(ctx.projectId, { kind: i.kind, limit: 100 })).map((m) => ({
          kind: m.kind,
          about: m.subject?.username ?? null,
          content: m.content,
          at: m.createdAt.slice(0, 10),
        })),
    });

    this.register({
      name: 'remember',
      description:
        'Save something to your memory for this project: a decision, a risk, a fact, or a note about a member. Keep it short and factual.',
      risk: 'WRITE_LOW',
      schema: z.object({
        kind: z.enum(MEMORY_KINDS),
        content: z.string().min(5).max(600),
        about_username: username.optional(),
      }),
      label: (i) => `Remember (${i.kind.toLowerCase()}): ${i.content.slice(0, 80)}`,
      run: async (ctx, i) => {
        const subject = i.about_username ? await this.member(ctx.projectId, i.about_username) : null;
        const m = await this.memory.write(
          ctx.projectId,
          { kind: i.kind as MemoryKind, content: i.content, subjectUserId: subject?.userId },
          { type: 'RUN', id: ctx.runId },
        );
        return { saved: m.id };
      },
    });
    this.register({
      name: 'post_message',
      description: 'Post a short message to the team chat as the AI PM.',
      risk: 'WRITE_LOW',
      schema: z.object({ body: z.string().min(2).max(1000) }),
      label: (i) => `Post to team chat: “${i.body.slice(0, 80)}”`,
      run: async (ctx, i) => {
        const m = await this.chat.postAsAi(ctx.projectId, i.body, { type: 'agent_run', id: ctx.runId });
        return { posted: m.id };
      },
    });
    this.register({
      name: 'comment_on_task',
      description: 'Add a comment to a task as the AI PM, e.g. a question or a nudge.',
      risk: 'WRITE_LOW',
      schema: z.object({ key: taskKeyField, body: z.string().min(2).max(1000) }),
      label: (i) => `Comment on ${i.key}`,
      run: async (ctx, i) => {
        const t = await this.taskByKey(ctx.projectId, i.key);
        // AI comments are logged on the timeline as agent activity (comments need a human author).
        await this.activity.record({
          projectId: ctx.projectId,
          type: 'TASK_COMMENTED',
          actorKind: 'AGENT',
          taskId: t.id,
          summary: `AI PM on ${i.key}: ${i.body.slice(0, 280)}`,
        });
        return { commented: i.key };
      },
    });

    this.register({
      name: 'create_task',
      description:
        'Propose a new task. A team member must approve it before it is created. Use for follow-ups, missing work, or splitting large tasks.',
      risk: 'NEEDS_APPROVAL',
      schema: z.object({
        title: z.string().min(3).max(200),
        description: z.string().max(2000).optional(),
        priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
        estimate: z
          .number()
          .int()
          .refine((n) => (STORY_POINTS as readonly number[]).includes(n), {
            message: `Estimate must be one of ${STORY_POINTS.join(', ')}`,
          }),
        role_key: z.string().max(60).optional(),
        assignee_username: username.optional(),
        add_to_active_sprint: z.boolean(),
      }),
      label: (i) =>
        `Create task “${i.title}” (${i.priority.toLowerCase()}, ${i.estimate} pts)${
          i.assignee_username ? ` for @${i.assignee_username}` : ''
        }${i.add_to_active_sprint ? ' in the active sprint' : ' in the backlog'}`,
      run: async (ctx, i) => {
        const approver = this.requireApprover(ctx);
        const s = await this.snapshot.load(ctx.projectId);
        const role = i.role_key ? s.roles.find((r) => r.key === i.role_key) : undefined;
        if (i.role_key && !role) throw new ToolInputError(`No role "${i.role_key}" in this project.`);
        const assignee = i.assignee_username ? await this.member(ctx.projectId, i.assignee_username) : null;
        const created = await this.tasks.create(approver, ctx.slug, {
          title: i.title,
          description: i.description,
          priority: i.priority,
          estimate: i.estimate,
          roleId: role?.id ?? null,
          assigneeId: assignee?.userId ?? null,
          sprintId: i.add_to_active_sprint ? (s.activeSprint?.id ?? null) : null,
          status: i.add_to_active_sprint && s.activeSprint ? 'TODO' : 'BACKLOG',
        });
        await this.prisma.task.update({ where: { id: created.id }, data: { aiSuggested: true } });
        return { created: created.key };
      },
    });
    this.register({
      name: 'update_task',
      description:
        'Propose a change to a task: reassign it, change priority, set a due date, or move it into the active sprint. A team member must approve it.',
      risk: 'NEEDS_APPROVAL',
      schema: z
        .object({
          key: taskKeyField,
          assignee_username: username.nullable().optional(),
          priority: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional(),
          due_date: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
          move_to_active_sprint: z.boolean().optional(),
          reason: z.string().min(5).max(300),
        })
        .refine(
          (i) =>
            i.assignee_username !== undefined ||
            i.priority !== undefined ||
            i.due_date !== undefined ||
            i.move_to_active_sprint,
          { message: 'Change at least one field.' },
        ),
      label: (i) => {
        const parts: string[] = [];
        if (i.assignee_username !== undefined)
          parts.push(i.assignee_username ? `assign to @${i.assignee_username}` : 'unassign');
        if (i.priority) parts.push(`priority ${i.priority.toLowerCase()}`);
        if (i.due_date !== undefined) parts.push(i.due_date ? `due ${i.due_date}` : 'clear due date');
        if (i.move_to_active_sprint) parts.push('move into the active sprint');
        return `${i.key}: ${parts.join(', ')}`;
      },
      run: async (ctx, i) => {
        const approver = this.requireApprover(ctx);
        const t = await this.taskByKey(ctx.projectId, i.key);
        const assignee =
          i.assignee_username === undefined
            ? undefined
            : i.assignee_username === null
              ? null
              : ((await this.member(ctx.projectId, i.assignee_username)).userId as string | null);
        const s = i.move_to_active_sprint ? await this.snapshot.load(ctx.projectId) : null;
        if (i.move_to_active_sprint && !s?.activeSprint) throw new ToolInputError('There is no active sprint.');
        await this.tasks.update(approver, t.id, {
          assigneeId: assignee,
          priority: i.priority,
          dueDate: i.due_date === undefined ? undefined : i.due_date ? `${i.due_date}T17:00:00.000Z` : null,
          sprintId: s?.activeSprint?.id,
        });
        return { updated: i.key };
      },
    });
  }

  private register<S extends z.ZodType>(def: ToolDef<S>) {
    this.tools.set(def.name, def as unknown as ToolDef<z.ZodType>);
  }

  definitions(): AiToolDefinition[] {
    return [...this.tools.values()].map((t) => ({
      name: t.name,
      description: `${t.description}${t.risk === 'NEEDS_APPROVAL' ? ' (Needs human approval.)' : ''}`,
      inputSchema: z.toJSONSchema(t.schema, { io: 'input' }) as Record<string, unknown>,
    }));
  }

  get(name: string) {
    return this.tools.get(name) ?? null;
  }

  /** Validates model-proposed input. Returns the parsed input or a readable error. */
  parse(name: string, input: unknown): { ok: true; value: unknown; label: string } | { ok: false; error: string } {
    const tool = this.get(name);
    if (!tool) return { ok: false, error: `Unknown tool "${name}".` };
    const r = tool.schema.safeParse(input);
    if (!r.success) {
      return {
        ok: false,
        error: r.error.issues.map((x) => `${x.path.join('.') || 'input'}: ${x.message}`).join('; '),
      };
    }
    return { ok: true, value: r.data, label: tool.label(r.data) };
  }

  async execute(ctx: ToolContext, name: string, input: unknown): Promise<unknown> {
    const tool = this.get(name);
    if (!tool) throw new ToolInputError(`Unknown tool "${name}".`);
    return tool.run(ctx, tool.schema.parse(input));
  }

  // ───────── helpers ─────────

  private requireApprover(ctx: ToolContext): AuthUser {
    if (!ctx.approver) throw new ToolInputError('This action needs a team member’s approval.');
    return ctx.approver;
  }

  private async member(projectId: string, username: string) {
    const m = await this.prisma.teamMember.findFirst({
      where: {
        status: TeamMemberStatus.ACTIVE,
        team: { projectId },
        user: { profile: { username: { equals: username.replace(/^@/, ''), mode: 'insensitive' } } },
      },
      select: { userId: true },
    });
    if (!m) throw new ToolInputError(`@${username} is not an active member of this team.`);
    return m;
  }

  private async taskByKey(projectId: string, key: string) {
    const t = await this.prisma.task.findFirst({
      where: { projectId, number: Number(key.slice(5)) },
      select: { id: true },
    });
    if (!t) throw new ToolInputError(`${key} does not exist in this project.`);
    return t;
  }
}
