import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, SkillLevel } from '@prisma/client';
import type { CourseDetail, CourseSummary } from '@studywidbuddy/shared';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';

const summaryInclude = {
  skills: { include: { skill: { select: { id: true, slug: true, name: true } } } },
  modules: { select: { _count: { select: { lessons: true } } } },
} satisfies Prisma.CourseInclude;

type CourseWithSummary = Prisma.CourseGetPayload<{ include: typeof summaryInclude }>;

export interface CourseListFilter {
  q?: string;
  level?: SkillLevel;
  category?: string;
}

@Injectable()
export class CoursesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(filter: CourseListFilter): Promise<CourseSummary[]> {
    const q = filter.q?.trim();
    const rows = await this.prisma.course.findMany({
      where: {
        publishedAt: { not: null },
        level: filter.level,
        category: filter.category ? { equals: filter.category, mode: 'insensitive' } : undefined,
        OR: q
          ? [
              { title: { contains: q, mode: 'insensitive' } },
              { summary: { contains: q, mode: 'insensitive' } },
              { skills: { some: { skill: { name: { contains: q, mode: 'insensitive' } } } } },
            ]
          : undefined,
      },
      orderBy: { title: 'asc' },
      include: summaryInclude,
    });
    const learners = await this.activeLearners(rows.map((r) => r.id));
    return rows.map((r) => this.toSummary(r, learners.get(r.id) ?? 0));
  }

  async detail(slug: string, userId: string | undefined): Promise<CourseDetail> {
    const row = await this.prisma.course.findFirst({
      where: { slug, publishedAt: { not: null } },
      include: {
        ...summaryInclude,
        modules: {
          orderBy: { position: 'asc' },
          include: {
            _count: { select: { lessons: true } },
            lessons: {
              orderBy: { position: 'asc' },
              select: { id: true, position: true, title: true, durationSec: true, youtubeId: true },
            },
          },
        },
      },
    });
    if (!row) throw notFound('Course');
    const [learners, mine] = await Promise.all([
      this.activeLearners([row.id]),
      userId
        ? this.prisma.enrollment.findFirst({
            where: { userId, courseId: row.id, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
            orderBy: { startedAt: 'desc' },
            select: { id: true },
          })
        : null,
    ]);
    return {
      ...this.toSummary(row, learners.get(row.id) ?? 0),
      description: row.description,
      outcomes: row.outcomes,
      modules: row.modules.map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        lessons: m.lessons.map(({ youtubeId, ...l }) => ({ ...l, hasVideo: !!youtubeId })),
      })),
      myEnrollmentId: mine?.id ?? null,
    };
  }

  private async activeLearners(courseIds: string[]): Promise<Map<string, number>> {
    if (!courseIds.length) return new Map();
    const groups = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      where: { courseId: { in: courseIds }, status: EnrollmentStatus.ACTIVE },
      _count: { _all: true },
    });
    return new Map(groups.map((g) => [g.courseId, g._count._all]));
  }

  private toSummary(r: CourseWithSummary, activeLearners: number): CourseSummary {
    return {
      id: r.id,
      slug: r.slug,
      title: r.title,
      summary: r.summary,
      category: r.category,
      level: r.level,
      estimatedHours: r.estimatedHours,
      skills: r.skills.map((s) => s.skill),
      moduleCount: r.modules.length,
      lessonCount: r.modules.reduce((n, m) => n + m._count.lessons, 0),
      activeLearners,
    };
  }
}
