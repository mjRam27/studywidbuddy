import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma, SkillLevel, SkillSource } from '@prisma/client';
import { MAX_ACTIVE_COURSES } from '@studywidbuddy/shared';
import type { EnrollmentView, MyLearningResponse } from '@studywidbuddy/shared';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { assertActive, assertCanComplete, assertCanEnroll, progressPercent } from './enrollment-rules';

const LEVEL_RANK: Record<SkillLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

type EnrollmentWithCourse = Prisma.EnrollmentGetPayload<{
  include: {
    progress: { select: { lessonId: true } };
    course: { include: { modules: { include: { lessons: { select: { id: true; position: true; title: true } } } } } };
  };
}>;

@Injectable()
export class EnrollmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start a course. The four-active-course rule is checked inside a transaction that first
   * locks the user's row, so two simultaneous requests can't both pass the count check.
   */
  async enroll(userId: string, courseId: string, level: SkillLevel): Promise<EnrollmentView> {
    const id = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;

      const course = await tx.course.findFirst({
        where: { id: courseId, publishedAt: { not: null } },
        select: { id: true },
      });
      if (!course) throw notFound('Course');

      const active = await tx.enrollment.findMany({
        where: { userId, status: EnrollmentStatus.ACTIVE },
        select: { courseId: true },
      });
      assertCanEnroll({
        activeCount: active.length,
        alreadyActiveInCourse: active.some((e) => e.courseId === courseId),
      });

      const created = await tx.enrollment.create({ data: { userId, courseId, level }, select: { id: true } });
      return created.id;
    });
    return this.view(userId, id);
  }

  async deregister(userId: string, enrollmentId: string): Promise<void> {
    const e = await this.owned(userId, enrollmentId);
    assertActive(e.status);
    const updated = await this.prisma.enrollment.updateMany({
      where: { id: e.id, status: EnrollmentStatus.ACTIVE },
      data: { status: EnrollmentStatus.DEREGISTERED, leftAt: new Date() },
    });
    if (updated.count !== 1) assertActive(EnrollmentStatus.DEREGISTERED);
  }

  async completeLesson(userId: string, enrollmentId: string, lessonId: string): Promise<EnrollmentView> {
    const e = await this.owned(userId, enrollmentId);
    assertActive(e.status);
    const lesson = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId: e.courseId } },
      select: { id: true },
    });
    if (!lesson) throw notFound('Lesson');
    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId, lessonId } },
      create: { enrollmentId, lessonId },
      update: {},
    });
    return this.view(userId, enrollmentId);
  }

  /**
   * Finish a course once every lesson is done. Completion records the course's skills as
   * DEMONSTRATED at the enrolled level (claimed skills stay separate).
   */
  async complete(userId: string, enrollmentId: string): Promise<EnrollmentView> {
    const e = await this.load(enrollmentId);
    if (e.userId !== userId) throw notFound('Enrollment');
    const totalLessons = e.course.modules.reduce((n, m) => n + m.lessons.length, 0);
    assertCanComplete({ status: e.status, completedLessons: e.progress.length, totalLessons });

    const skills = await this.prisma.courseSkill.findMany({
      where: { courseId: e.courseId },
      select: { skillId: true },
    });
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.enrollment.updateMany({
        where: { id: e.id, status: EnrollmentStatus.ACTIVE },
        data: { status: EnrollmentStatus.COMPLETED, completedAt: new Date() },
      });
      if (done.count !== 1) assertActive(EnrollmentStatus.COMPLETED);
      for (const { skillId } of skills) {
        const key = { userId_skillId_source: { userId, skillId, source: SkillSource.DEMONSTRATED } };
        const existing = await tx.userSkill.findUnique({ where: key, select: { level: true } });
        if (!existing) {
          await tx.userSkill.create({ data: { userId, skillId, source: SkillSource.DEMONSTRATED, level: e.level } });
        } else if (LEVEL_RANK[e.level] > LEVEL_RANK[existing.level]) {
          await tx.userSkill.update({ where: key, data: { level: e.level } });
        }
      }
    });
    return this.view(userId, enrollmentId);
  }

  async myLearning(userId: string): Promise<MyLearningResponse> {
    const [active, completedCount] = await Promise.all([
      this.prisma.enrollment.findMany({
        where: { userId, status: EnrollmentStatus.ACTIVE },
        orderBy: { startedAt: 'asc' },
        include: this.includeForView(),
      }),
      this.prisma.enrollment.count({ where: { userId, status: EnrollmentStatus.COMPLETED } }),
    ]);
    return { maxActive: MAX_ACTIVE_COURSES, active: active.map((e) => this.toView(e)), completedCount };
  }

  async view(userId: string, enrollmentId: string): Promise<EnrollmentView> {
    const e = await this.load(enrollmentId);
    if (e.userId !== userId) throw notFound('Enrollment');
    return this.toView(e);
  }

  /** Ownership check. Another user's enrollment looks the same as a missing one. */
  private async owned(userId: string, enrollmentId: string) {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId } });
    if (!e || e.userId !== userId) throw notFound('Enrollment');
    return e;
  }

  private async load(enrollmentId: string): Promise<EnrollmentWithCourse> {
    const e = await this.prisma.enrollment.findUnique({ where: { id: enrollmentId }, include: this.includeForView() });
    if (!e) throw notFound('Enrollment');
    return e;
  }

  private includeForView() {
    return {
      progress: { select: { lessonId: true } },
      course: {
        include: {
          modules: {
            orderBy: { position: 'asc' as const },
            include: {
              lessons: { orderBy: { position: 'asc' as const }, select: { id: true, position: true, title: true } },
            },
          },
        },
      },
    };
  }

  private toView(e: EnrollmentWithCourse): EnrollmentView {
    const done = new Set(e.progress.map((p) => p.lessonId));
    let total = 0;
    let next: EnrollmentView['nextLesson'] = null;
    let currentModule: EnrollmentView['currentModule'] = null;
    for (const m of e.course.modules) {
      for (const l of m.lessons) {
        total++;
        if (!next && !done.has(l.id)) {
          next = { id: l.id, label: `${m.position}.${l.position}`, title: l.title };
          currentModule = { position: m.position, title: m.title };
        }
      }
    }
    return {
      id: e.id,
      status: e.status,
      level: e.level,
      startedAt: e.startedAt.toISOString(),
      completedAt: e.completedAt?.toISOString() ?? null,
      progress: progressPercent(done.size, total),
      completedLessonIds: [...done],
      course: { id: e.course.id, slug: e.course.slug, title: e.course.title, category: e.course.category },
      currentModule,
      nextLesson: next,
    };
  }
}
