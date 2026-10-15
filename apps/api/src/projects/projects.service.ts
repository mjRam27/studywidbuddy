import { Injectable } from '@nestjs/common';
import { ApplicationStatus, Prisma, ProjectStatus, SkillLevel } from '@prisma/client';
import type { Page, ProjectDetail, ProjectSummary } from '@studywidbuddy/shared';
import { AuthUser } from '../common/auth/auth-user';
import { notFound } from '../common/errors/domain-error';
import { afterCursor, decodeCursor, DEFAULT_PAGE_SIZE, toPage } from '../common/http/pagination';
import { PrismaService } from '../common/prisma/prisma.service';

/** Statuses visible in discovery. Drafts and archived projects are admin-only. */
const DISCOVERABLE: ProjectStatus[] = [ProjectStatus.OPEN, ProjectStatus.IN_PROGRESS, ProjectStatus.COMPLETED];
const LIVE_APPLICATION = { not: ApplicationStatus.WITHDRAWN };

const projectInclude = {
  techStack: { include: { skill: { select: { id: true, slug: true, name: true } } } },
  roles: {
    orderBy: { title: 'asc' },
    include: {
      requiredSkills: { include: { skill: { select: { id: true, slug: true, name: true } } } },
      // Filled seats = people on the team (invited or active), not applications.
      _count: { select: { members: { where: { status: { in: ['INVITED', 'ACTIVE'] } } } } },
    },
  },
  _count: { select: { applications: { where: { status: LIVE_APPLICATION } } } },
} satisfies Prisma.ProjectInclude;

type ProjectRow = Prisma.ProjectGetPayload<{ include: typeof projectInclude }>;

export interface ProjectListFilter {
  q?: string;
  difficulty?: SkillLevel;
  skill?: string;
  role?: string;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: ProjectListFilter, viewer: AuthUser | undefined): Promise<Page<ProjectSummary>> {
    const limit = filter.limit ?? DEFAULT_PAGE_SIZE;
    const q = filter.q?.trim();
    const and: Prisma.ProjectWhereInput[] = [
      { status: viewer?.role === 'ADMIN' ? undefined : { in: DISCOVERABLE } },
      { difficulty: filter.difficulty },
      filter.skill ? { techStack: { some: { skill: { slug: filter.skill } } } } : {},
      filter.role
        ? {
            roles: {
              some: {
                OR: [{ key: filter.role }, { title: { contains: filter.role, mode: 'insensitive' } }],
              },
            },
          }
        : {},
      q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { summary: { contains: q, mode: 'insensitive' } },
              { techStack: { some: { skill: { name: { contains: q, mode: 'insensitive' } } } } },
            ],
          }
        : {},
      afterCursor(decodeCursor(filter.cursor)),
    ];
    const rows = await this.prisma.project.findMany({
      where: { AND: and },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      include: projectInclude,
    });
    const mySkills = await this.skillIds(viewer?.id);
    return toPage(rows, limit, (r) => this.toSummary(r, mySkills));
  }

  async detail(slug: string, viewer: AuthUser | undefined): Promise<ProjectDetail> {
    const row = await this.prisma.project.findUnique({ where: { slug }, include: projectInclude });
    if (!row || (!DISCOVERABLE.includes(row.status) && viewer?.role !== 'ADMIN')) throw notFound('Project');
    const [mySkills, mine] = await Promise.all([
      this.skillIds(viewer?.id),
      viewer
        ? this.prisma.projectApplication.findFirst({
            where: { projectId: row.id, userId: viewer.id, status: LIVE_APPLICATION },
            include: { role: { select: { title: true } } },
          })
        : null,
    ]);
    const summary = this.toSummary(row, mySkills);
    return {
      ...summary,
      description: row.description,
      problem: row.problem,
      startsAt: row.startsAt?.toISOString() ?? null,
      roles: row.roles.map((r) => ({
        id: r.id,
        key: r.key,
        title: r.title,
        description: r.description,
        seats: r.seats,
        open: Math.max(0, r.seats - r._count.members),
        requiredSkills: r.requiredSkills.map((s) => ({ ...s.skill, minLevel: s.minLevel })),
      })),
      myApplication: mine ? { id: mine.id, status: mine.status, roleTitle: mine.role.title } : null,
    };
  }

  private async skillIds(userId: string | undefined): Promise<Set<string> | null> {
    if (!userId) return null;
    const rows = await this.prisma.userSkill.findMany({ where: { userId }, select: { skillId: true } });
    return new Set(rows.map((r) => r.skillId));
  }

  private skillMatch(techStack: { id: string }[], mySkills: Set<string>) {
    const matchedSkillIds = techStack.filter((s) => mySkills.has(s.id)).map((s) => s.id);
    return { matched: matchedSkillIds.length, total: techStack.length, matchedSkillIds };
  }

  private toSummary(r: ProjectRow, mySkills: Set<string> | null): ProjectSummary {
    const techStack = r.techStack.map((t) => t.skill);
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      category: r.category,
      summary: r.summary,
      difficulty: r.difficulty,
      status: r.status,
      durationWeeks: r.durationWeeks,
      teamSize: r.teamSize,
      techStack,
      roles: r.roles.map((role) => ({
        key: role.key,
        title: role.title,
        seats: role.seats,
        open: Math.max(0, role.seats - role._count.members),
      })),
      applicationDeadline: r.applicationDeadline?.toISOString() ?? null,
      applicantCount: r._count.applications,
      skillMatch: mySkills ? this.skillMatch(techStack, mySkills) : null,
    };
  }
}
