import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, SkillLevel } from '@prisma/client';
import type { CourseRecommendation, LearningActivityItem, LearningStats } from '@studywidbuddy/shared';
import { PrismaService } from '../common/prisma/prisma.service';
import { CoursesService } from '../courses/courses.service';
import { dayKey, lastDays, safeTimeZone, streakLength } from './learning-stats';

const GRID_DAYS = 35;
const STREAK_LOOKBACK_DAYS = 400;
const LEVEL_RANK: Record<SkillLevel, number> = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

@Injectable()
export class LearningInsightsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly courses: CoursesService,
  ) {}

  async stats(userId: string, now = new Date()): Promise<LearningStats> {
    const profile = await this.prisma.profile.findUnique({ where: { userId }, select: { timezone: true } });
    const tz = safeTimeZone(profile?.timezone);

    const since = new Date(now.getTime() - STREAK_LOOKBACK_DAYS * 86_400_000);
    const progress = await this.prisma.lessonProgress.findMany({
      where: { enrollment: { userId }, completedAt: { gte: since } },
      select: { completedAt: true, lesson: { select: { durationSec: true } } },
    });

    const perDay = new Map<string, number>();
    for (const p of progress) {
      const k = dayKey(p.completedAt, tz);
      perDay.set(k, (perDay.get(k) ?? 0) + 1);
    }
    const streakKeys = lastDays(now, STREAK_LOOKBACK_DAYS, tz);
    const gridKeys = streakKeys.slice(-GRID_DAYS);

    const monthPrefix = dayKey(now, tz).slice(0, 7);
    const inMonth = (d: Date | null) => !!d && dayKey(d, tz).startsWith(monthPrefix);
    const monthProgress = progress.filter((p) => inMonth(p.completedAt));
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      select: { startedAt: true, completedAt: true },
    });

    return {
      streakDays: streakLength(new Set(perDay.keys()), streakKeys),
      days: gridKeys.map((date) => ({ date, count: perDay.get(date) ?? 0 })),
      thisMonth: {
        lessonsCompleted: monthProgress.length,
        minutesLearned: Math.round(monthProgress.reduce((s, p) => s + p.lesson.durationSec, 0) / 60),
        coursesCompleted: enrollments.filter((e) => inMonth(e.completedAt)).length,
        coursesStarted: enrollments.filter((e) => inMonth(e.startedAt)).length,
      },
      recent: await this.recentActivity(userId),
    };
  }

  /** Most recent learning events, merged from progress and enrollment history. */
  private async recentActivity(userId: string, limit = 6): Promise<LearningActivityItem[]> {
    const [lessons, enrollments] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { enrollment: { userId } },
        orderBy: { completedAt: 'desc' },
        take: limit,
        select: {
          completedAt: true,
          lesson: {
            select: {
              position: true,
              title: true,
              module: { select: { position: true, course: { select: { title: true } } } },
            },
          },
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: { startedAt: true, completedAt: true, leftAt: true, course: { select: { title: true } } },
      }),
    ]);
    const items: LearningActivityItem[] = lessons.map((p) => ({
      kind: 'LESSON_COMPLETED',
      at: p.completedAt.toISOString(),
      courseTitle: p.lesson.module.course.title,
      detail: `${p.lesson.module.position}.${p.lesson.position} ${p.lesson.title}`,
    }));
    for (const e of enrollments) {
      items.push({ kind: 'COURSE_STARTED', at: e.startedAt.toISOString(), courseTitle: e.course.title, detail: null });
      if (e.completedAt)
        items.push({
          kind: 'COURSE_COMPLETED',
          at: e.completedAt.toISOString(),
          courseTitle: e.course.title,
          detail: null,
        });
      if (e.leftAt)
        items.push({ kind: 'COURSE_LEFT', at: e.leftAt.toISOString(), courseTitle: e.course.title, detail: null });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  }

  /**
   * Deterministic recommendations: courses the user isn't taking, scored by overlap with
   * skills they have, with a bonus for a natural next step (a higher level of a skill they
   * already use). Every score comes with the reasons that produced it.
   */
  async recommendations(userId: string, limit = 3): Promise<CourseRecommendation[]> {
    const [userSkills, taken, catalogue] = await Promise.all([
      this.prisma.userSkill.findMany({ where: { userId }, include: { skill: { select: { id: true, name: true } } } }),
      this.prisma.enrollment.findMany({
        where: { userId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
        select: { courseId: true },
      }),
      this.courses.list({}),
    ]);
    const takenIds = new Set(taken.map((t) => t.courseId));
    const best = new Map<string, { name: string; rank: number }>();
    for (const s of userSkills) {
      const prev = best.get(s.skillId);
      if (!prev || LEVEL_RANK[s.level] > prev.rank)
        best.set(s.skillId, { name: s.skill.name, rank: LEVEL_RANK[s.level] });
    }

    const scored = catalogue
      .filter((c) => !takenIds.has(c.id))
      .map((course) => {
        const known = course.skills.filter((s) => best.has(s.id));
        const reasons: string[] = [];
        let score = known.length * 2;
        if (known.length) reasons.push(`Builds on ${known.map((s) => s.name).join(', ')}`);
        const nextStep = known.some((s) => LEVEL_RANK[course.level] === best.get(s.id)!.rank + 1);
        if (nextStep) {
          score += 3;
          reasons.push('A step up from your current level');
        }
        if (!known.length) reasons.push('New area for you');
        score += Math.min(course.activeLearners, 20) / 20; // tie-break toward courses with buddies available
        if (course.activeLearners > 0) reasons.push(`${course.activeLearners} learning it now`);
        return { course, reasons, score };
      })
      .sort((a, b) => b.score - a.score || a.course.title.localeCompare(b.course.title));

    return scored.slice(0, limit).map(({ course, reasons }) => ({ course, reasons }));
  }
}
