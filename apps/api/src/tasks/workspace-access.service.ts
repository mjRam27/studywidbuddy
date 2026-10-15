import { HttpStatus, Injectable } from '@nestjs/common';
import { TeamMemberStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { AuthUser } from '../common/auth/auth-user';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';

export interface WorkspaceContext {
  projectId: string;
  slug: string;
  title: string;
  /** The caller's ACTIVE team membership, if any. */
  memberId: string | null;
  isAdmin: boolean;
}

/**
 * The project workspace is private to the team: only ACTIVE members (and admins) can read
 * or change it. Invited-but-not-accepted people see nothing yet.
 */
@Injectable()
export class WorkspaceAccess {
  constructor(private readonly prisma: PrismaService) {}

  async bySlug(user: AuthUser, slug: string): Promise<WorkspaceContext> {
    const p = await this.prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!p) throw notFound('Project');
    return this.byId(user, p.id);
  }

  async byId(user: AuthUser, projectId: string): Promise<WorkspaceContext> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        slug: true,
        title: true,
        team: {
          select: { members: { where: { userId: user.id, status: TeamMemberStatus.ACTIVE }, select: { id: true } } },
        },
      },
    });
    if (!project) throw notFound('Project');
    const memberId = project.team?.members[0]?.id ?? null;
    const isAdmin = user.role === 'ADMIN';
    if (!memberId && !isAdmin) {
      throw new DomainError(
        ErrorCode.NOT_A_TEAM_MEMBER,
        'Only members of this project’s team can open its workspace.',
        HttpStatus.FORBIDDEN,
      );
    }
    return { projectId: project.id, slug: project.slug, title: project.title, memberId, isAdmin };
  }

  /** For task-scoped routes: resolves the task's project, then checks membership. */
  async byTask(user: AuthUser, taskId: string): Promise<WorkspaceContext> {
    const t = await this.prisma.task.findUnique({ where: { id: taskId }, select: { projectId: true } });
    if (!t) throw notFound('Task');
    return this.byId(user, t.projectId);
  }

  /** Assignees must be active members of this project's team. */
  async assertAssignable(projectId: string, userId: string): Promise<void> {
    const m = await this.prisma.teamMember.findFirst({
      where: { userId, status: TeamMemberStatus.ACTIVE, team: { projectId } },
      select: { id: true },
    });
    if (!m) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'Tasks can only be assigned to active team members.',
        HttpStatus.BAD_REQUEST,
      );
    }
  }
}
