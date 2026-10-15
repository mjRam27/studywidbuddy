import { HttpStatus, Injectable } from '@nestjs/common';
import {
  ApplicationStatus,
  InterviewStatus,
  Prisma,
  ProjectStatus,
  SelectionRunStatus,
  TeamMemberStatus,
} from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { MyMembershipView, SelectionRunView, TeamView } from '@studywidbuddy/shared';
import { ActivityService } from '../activity/activity.service';
import { GithubService } from '../github/github.service';
import { ApplicationsService } from '../applications/applications.service';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { type CandidateInput, type Level, type RoleInput, selectTeam } from './selection';

/** Seats held by these member statuses count as filled. */
const HOLDING: TeamMemberStatus[] = [TeamMemberStatus.INVITED, TeamMemberStatus.ACTIVE];

const personSelect = {
  id: true,
  profile: { select: { username: true, displayName: true, avatarUrl: true } },
} satisfies Prisma.UserSelect;
type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;
const person = (u: PersonRow) => ({
  id: u.id,
  username: u.profile?.username ?? '',
  displayName: u.profile?.displayName ?? '',
  avatarUrl: u.profile?.avatarUrl ?? null,
});

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly applications: ApplicationsService,
    private readonly activity: ActivityService,
    private readonly github: GithubService,
  ) {}

  // ───────── Admin: selection ─────────

  /**
   * Runs the deterministic selection over every evaluated application and stores the
   * result as a PROPOSED run. Nothing changes for candidates until the run is applied.
   */
  async propose(adminId: string, projectId: string): Promise<SelectionRunView> {
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        roles: { include: { requiredSkills: { include: { skill: { select: { name: true } } } } } },
        team: { include: { members: { where: { status: { in: HOLDING } } } } },
      },
    });
    if (!project) throw notFound('Project');
    if (project.status !== ProjectStatus.OPEN) {
      throw new DomainError(
        ErrorCode.PROJECT_NOT_OPEN,
        'Selection runs only while a project is recruiting.',
        HttpStatus.CONFLICT,
      );
    }

    const taken = new Map<string, number>();
    for (const m of project.team?.members ?? []) taken.set(m.roleId, (taken.get(m.roleId) ?? 0) + 1);
    const roles: RoleInput[] = project.roles
      .map((r) => ({
        id: r.id,
        title: r.title,
        seats: Math.max(0, r.seats - (taken.get(r.id) ?? 0)),
        requiredSkills: r.requiredSkills.map((s) => ({
          skillId: s.skillId,
          name: s.skill.name,
          minLevel: s.minLevel as Level,
        })),
      }))
      .filter((r) => r.seats > 0);

    const apps = await this.prisma.projectApplication.findMany({
      where: { projectId, status: ApplicationStatus.UNDER_REVIEW },
      include: {
        user: { select: { ...personSelect, skills: true } },
        interview: { select: { status: true, evaluation: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
    const candidates: CandidateInput[] = apps.map((a) => {
      const ev = a.interview?.status === InterviewStatus.EVALUATED ? a.interview.evaluation : null;
      const skills = new Map<string, { level: Level; proven: boolean }>();
      for (const s of a.user.skills) {
        const prev = skills.get(s.skillId);
        const rank = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };
        skills.set(s.skillId, {
          level: (prev && rank[prev.level] > rank[s.level] ? prev.level : s.level) as Level,
          proven: !!prev?.proven || s.source === 'DEMONSTRATED',
        });
      }
      return {
        applicationId: a.id,
        userId: a.userId,
        name: a.user.profile?.displayName ?? '',
        appliedRoleId: a.roleId,
        recommendedRoleId: ev?.recommendedRoleId ?? null,
        hoursPerWeek: a.availabilityHoursPerWeek,
        evaluation: ev ? { overall: ev.overallScore, technical: ev.technicalScore } : null,
        skills,
      };
    });

    const result = selectTeam(roles, candidates);
    const run = await this.prisma.$transaction(async (tx) => {
      await tx.teamSelectionRun.updateMany({
        where: { projectId, status: SelectionRunStatus.PROPOSED },
        data: { status: SelectionRunStatus.DISCARDED },
      });
      return tx.teamSelectionRun.create({
        data: {
          projectId,
          summary: result.summary,
          createdById: adminId,
          decisions: {
            create: result.decisions.map((d) => ({
              applicationId: d.applicationId,
              selected: d.selected,
              roleId: d.roleId,
              fit: d.fit,
              reasons: d.reasons,
            })),
          },
        },
      });
    });
    return this.runView(run.id);
  }

  async latestRun(projectId: string): Promise<SelectionRunView> {
    const run = await this.prisma.teamSelectionRun.findFirst({
      where: { projectId, status: { not: SelectionRunStatus.DISCARDED } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    if (!run) throw notFound('Selection run');
    return this.runView(run.id);
  }

  /**
   * Applies a proposal: forms the team, invites the selected people, and closes every
   * other evaluated application with feedback. All in one transaction.
   */
  async apply(adminId: string, runId: string): Promise<SelectionRunView> {
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.teamSelectionRun.findUnique({ where: { id: runId }, include: { decisions: true } });
      if (!run) throw notFound('Selection run');
      const claimed = await tx.teamSelectionRun.updateMany({
        where: { id: runId, status: SelectionRunStatus.PROPOSED },
        data: { status: SelectionRunStatus.APPLIED, appliedById: adminId, appliedAt: new Date() },
      });
      if (claimed.count !== 1) {
        throw new DomainError(
          ErrorCode.SELECTION_NOT_PROPOSED,
          'This selection was already applied or replaced.',
          HttpStatus.CONFLICT,
        );
      }

      const team = await tx.team.upsert({
        where: { projectId: run.projectId },
        create: { projectId: run.projectId },
        update: {},
      });
      for (const d of run.decisions) {
        const app = await tx.projectApplication.findUnique({
          where: { id: d.applicationId },
          select: { status: true, userId: true },
        });
        // Someone may have withdrawn since the proposal; skip anything no longer under review.
        if (!app || app.status !== ApplicationStatus.UNDER_REVIEW) continue;
        if (d.selected && d.roleId) {
          await this.applications.transitionIn(
            tx,
            d.applicationId,
            ApplicationStatus.SELECTED,
            adminId,
            () => undefined,
          );
          await tx.teamMember.create({
            data: { teamId: team.id, userId: app.userId, roleId: d.roleId, applicationId: d.applicationId },
          });
        } else {
          await this.applications.transitionIn(
            tx,
            d.applicationId,
            ApplicationStatus.REJECTED,
            adminId,
            () => undefined,
          );
        }
      }
      await tx.project.update({ where: { id: run.projectId }, data: { status: ProjectStatus.IN_PROGRESS } });
    });
    return this.runView(runId);
  }

  // ───────── Members ─────────

  async respond(userId: string, memberId: string, accept: boolean): Promise<MyMembershipView> {
    const m = await this.prisma.teamMember.findUnique({
      where: { id: memberId },
      select: { userId: true, status: true, team: { select: { projectId: true } }, role: { select: { title: true } } },
    });
    if (!m || m.userId !== userId) throw notFound('Invitation');
    const updated = await this.prisma.teamMember.updateMany({
      where: { id: memberId, status: TeamMemberStatus.INVITED },
      data: { status: accept ? TeamMemberStatus.ACTIVE : TeamMemberStatus.DECLINED, respondedAt: new Date() },
    });
    if (updated.count !== 1) {
      throw new DomainError(
        ErrorCode.INVALID_STATUS_TRANSITION,
        'You already answered this invitation.',
        HttpStatus.CONFLICT,
      );
    }
    if (accept) {
      await this.activity.record({
        projectId: m.team.projectId,
        type: 'MEMBER_JOINED',
        actorUserId: userId,
        summary: `joined the team as ${m.role.title}`,
      });
      // Give the new member access to the team repo (no-op without a repo or a linked account).
      await this.github.onMembershipChanged(m.team.projectId);
    }
    const mine = await this.myMemberships(userId);
    return mine.find((x) => x.memberId === memberId)!;
  }

  async myMemberships(userId: string): Promise<MyMembershipView[]> {
    const rows = await this.prisma.teamMember.findMany({
      where: { userId, status: { in: HOLDING } },
      orderBy: { invitedAt: 'desc' },
      include: {
        role: { select: { id: true, title: true } },
        team: { select: { id: true, project: { select: { id: true, slug: true, title: true, status: true } } } },
      },
    });
    return rows.map((m) => ({
      memberId: m.id,
      status: m.status,
      role: m.role,
      team: { id: m.team.id },
      project: m.team.project,
    }));
  }

  /** The team behind a project. Visible to any signed-in user (it's shown on the project page). */
  async teamForProject(slug: string): Promise<TeamView> {
    const team = await this.prisma.team.findFirst({
      where: { project: { slug } },
      include: {
        project: { select: { id: true, slug: true, title: true, status: true } },
        members: {
          where: { status: { in: HOLDING } },
          orderBy: { invitedAt: 'asc' },
          include: { user: { select: personSelect }, role: { select: { id: true, title: true } } },
        },
      },
    });
    if (!team) throw notFound('Team');
    return {
      id: team.id,
      project: team.project,
      formedAt: team.formedAt.toISOString(),
      members: team.members.map((m) => ({ id: m.id, user: person(m.user), role: m.role, status: m.status })),
    };
  }

  private async runView(runId: string): Promise<SelectionRunView> {
    const run = await this.prisma.teamSelectionRun.findUniqueOrThrow({
      where: { id: runId },
      include: {
        project: { include: { roles: { orderBy: { title: 'asc' } } } },
        decisions: {
          orderBy: [{ selected: 'desc' }, { fit: 'desc' }],
          include: {
            role: { select: { id: true, title: true } },
            application: {
              include: {
                role: { select: { id: true, title: true } },
                user: { select: personSelect },
                interview: { select: { evaluation: { include: { recommendedRole: { select: { title: true } } } } } },
              },
            },
          },
        },
      },
    });
    return {
      id: run.id,
      projectId: run.projectId,
      status: run.status,
      summary: run.summary,
      createdAt: run.createdAt.toISOString(),
      appliedAt: run.appliedAt?.toISOString() ?? null,
      roles: run.project.roles.map((r) => ({
        id: r.id,
        title: r.title,
        seats: r.seats,
        selected: run.decisions.filter((d) => d.selected && d.roleId === r.id).length,
      })),
      candidates: run.decisions.map((d) => {
        const ev = d.application.interview?.evaluation;
        return {
          applicationId: d.applicationId,
          user: person(d.application.user),
          appliedRole: d.application.role,
          hoursPerWeek: d.application.availabilityHoursPerWeek,
          evaluation: ev
            ? {
                overall: ev.overallScore,
                technical: ev.technicalScore,
                problemSolving: ev.problemSolvingScore,
                communication: ev.communicationScore,
                projectFit: ev.projectFitScore,
                recommendedRoleTitle: ev.recommendedRole?.title ?? null,
              }
            : null,
          decision: { selected: d.selected, role: d.role, fit: d.fit, reasons: d.reasons },
        };
      }),
    };
  }
}
