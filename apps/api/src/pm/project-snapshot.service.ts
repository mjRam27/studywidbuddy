import { Injectable } from '@nestjs/common';
import { SprintStatus, TeamMemberStatus } from '@prisma/client';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { taskKey } from '../tasks/tasks.service';

export interface SnapshotMember {
  userId: string;
  username: string;
  displayName: string;
  role: string;
  roleKey: string;
}

export interface SnapshotTask {
  id: string;
  key: string;
  title: string;
  status: string;
  priority: string;
  estimate: number;
  assignee: string | null;
  role: string | null;
  inActiveSprint: boolean;
  blockedBy: string[];
  overdue: boolean;
  dueDate: string | null;
  updatedAt: Date;
}

export interface ProjectSnapshot {
  projectId: string;
  slug: string;
  title: string;
  summary: string;
  problem: string;
  status: string;
  startsAt: Date | null;
  endsAt: Date | null;
  members: SnapshotMember[];
  roles: { id: string; key: string; title: string }[];
  activeSprint: { id: string; number: number; goal: string; endsAt: Date } | null;
  tasks: SnapshotTask[];
}

/** One read of everything the AI PM reasons about, scoped to a single project. */
@Injectable()
export class ProjectSnapshotService {
  constructor(private readonly prisma: PrismaService) {}

  async load(projectId: string): Promise<ProjectSnapshot> {
    const p = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        roles: { select: { id: true, key: true, title: true } },
        team: {
          include: {
            members: {
              where: { status: TeamMemberStatus.ACTIVE },
              include: {
                role: { select: { key: true, title: true } },
                user: { select: { id: true, profile: { select: { username: true, displayName: true } } } },
              },
            },
          },
        },
        sprints: { where: { status: SprintStatus.ACTIVE }, take: 1 },
        tasks: {
          orderBy: { number: 'asc' },
          include: {
            assignee: { select: { profile: { select: { username: true } } } },
            role: { select: { title: true } },
            dependsOn: { include: { dependsOn: { select: { number: true, status: true } } } },
          },
        },
      },
    });
    if (!p) throw notFound('Project');
    const now = new Date();
    const active = p.sprints[0] ?? null;
    const endsAt = p.startsAt ? new Date(p.startsAt.getTime() + p.durationWeeks * 7 * 86_400_000) : null;
    return {
      projectId: p.id,
      slug: p.slug,
      title: p.title,
      summary: p.summary,
      problem: p.problem,
      status: p.status,
      startsAt: p.startsAt,
      endsAt,
      roles: p.roles,
      members: (p.team?.members ?? []).map((m) => ({
        userId: m.userId,
        username: m.user.profile?.username ?? m.userId,
        displayName: m.user.profile?.displayName ?? 'Member',
        role: m.role.title,
        roleKey: m.role.key,
      })),
      activeSprint: active ? { id: active.id, number: active.number, goal: active.goal, endsAt: active.endsAt } : null,
      tasks: p.tasks.map((t) => ({
        id: t.id,
        key: taskKey(t.number),
        title: t.title,
        status: t.status,
        priority: t.priority,
        estimate: t.estimate,
        assignee: t.assignee?.profile?.username ?? null,
        role: t.role?.title ?? null,
        inActiveSprint: !!active && t.sprintId === active.id,
        blockedBy: t.dependsOn.filter((d) => d.dependsOn.status !== 'DONE').map((d) => taskKey(d.dependsOn.number)),
        overdue: !!t.dueDate && t.dueDate < now && t.status !== 'DONE',
        dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
        updatedAt: t.updatedAt,
      })),
    };
  }

  /** Compact prompt text: brief, team with workload, and the active board. */
  promptBlock(s: ProjectSnapshot): string {
    const open = s.tasks.filter((t) => t.status !== 'DONE');
    const team = s.members
      .map((m) => {
        const mine = open.filter((t) => t.assignee === m.username);
        const pts = mine.reduce((n, t) => n + t.estimate, 0);
        const list = mine.map((t) => `${t.key} ${t.status.toLowerCase()}`).join(', ') || 'nothing assigned';
        return `- @${m.username} (${m.displayName}), ${m.role}: ${pts} open pts · ${list}`;
      })
      .join('\n');
    const board = open
      .filter((t) => t.inActiveSprint || t.status !== 'BACKLOG')
      .slice(0, 60)
      .map(
        (t) =>
          `- ${t.key} [${t.status}] ${t.title} · ${t.priority.toLowerCase()} · ${t.estimate}pts · ${
            t.assignee ? '@' + t.assignee : 'unassigned'
          }${t.blockedBy.length ? ` · blocked by ${t.blockedBy.join(', ')}` : ''}${t.overdue ? ' · OVERDUE' : ''}`,
      )
      .join('\n');
    const done = s.tasks.filter((t) => t.status === 'DONE').length;
    return `<project>
Title: ${s.title}
Summary: ${s.summary}
Problem: ${s.problem}
Status: ${s.status}${s.endsAt ? ` · planned end ${s.endsAt.toISOString().slice(0, 10)}` : ''}
Active sprint: ${s.activeSprint ? `#${s.activeSprint.number} "${s.activeSprint.goal}", ends ${s.activeSprint.endsAt.toISOString().slice(0, 10)}` : 'none'}
Tasks: ${s.tasks.length} total, ${done} done, ${open.length} open
</project>

<team>
${team || '- (no active members)'}
</team>

<board note="open tasks in the active sprint or already started">
${board || '- (nothing open)'}
</board>`;
  }
}
