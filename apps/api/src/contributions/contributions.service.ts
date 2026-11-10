import { Injectable } from '@nestjs/common';
import { ActorKind, TaskStatus } from '@prisma/client';
import {
  DEBUG_LEVEL_LABEL,
  type ContributionCalendar,
  type ContributionDayDetail,
  type DebugProfileStats,
} from '@studywidbuddy/shared';
import type { AuthUser } from '../common/auth/auth-user';
import { PrismaService } from '../common/prisma/prisma.service';
import { DebugService } from '../debug/debug.service';
import { findExercise } from '../debug/catalogue';
import { dayKey, lastDays, safeTimeZone } from '../enrollments/learning-stats';
import { ProfilesService } from '../profiles/profiles.service';
import { taskKey } from '../tasks/tasks.service';
import {
  buildCalendar,
  type DatedItem,
  formatDuration,
  itemsOn,
  parseKinds,
  projectItems,
  studyItems,
} from './calendar';

const DAY = 86_400_000;
/** 53 weeks, like GitHub's graph. */
const CALENDAR_DAYS = 371;

interface Owner {
  userId: string;
  tz: string;
  isSelf: boolean;
}

/**
 * The profile's contribution graph. A day is filled only by real work: a solved Debug
 * exercise, 30+ minutes of study, a finished project task, project work (code, PRs, task
 * updates) or an AI interview. Same visibility rules as the profile itself.
 */
@Injectable()
export class ContributionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly profiles: ProfilesService,
    private readonly debug: DebugService,
  ) {}

  async calendar(username: string, viewer: AuthUser, kinds?: string): Promise<ContributionCalendar> {
    const owner = await this.owner(username, viewer);
    const now = new Date();
    const keys = lastDays(now, CALENDAR_DAYS, owner.tz);
    const items = await this.collect(owner, new Date(now.getTime() - (CALENDAR_DAYS + 1) * DAY), now);
    return buildCalendar(items, keys, parseKinds(kinds), owner.tz);
  }

  async day(username: string, viewer: AuthUser, date: string, kinds?: string): Promise<ContributionDayDetail> {
    const owner = await this.owner(username, viewer);
    // A local day can span up to ±14 hours of UTC; widen the window and filter by key.
    const noon = Date.parse(`${date}T12:00:00Z`);
    const items = await this.collect(owner, new Date(noon - 2 * DAY), new Date(noon + 2 * DAY));
    return { date, items: itemsOn(items, date, parseKinds(kinds)) };
  }

  async debugging(username: string, viewer: AuthUser): Promise<DebugProfileStats> {
    return this.debug.profileStats((await this.owner(username, viewer)).userId);
  }

  private async owner(username: string, viewer: AuthUser): Promise<Owner> {
    const row = await this.profiles.visibleRow(username.toLowerCase(), viewer);
    return { userId: row.userId, tz: safeTimeZone(row.timezone), isSelf: row.userId === viewer.id };
  }

  /** Every countable thing the owner did between from and to, as dated items. */
  private async collect({ userId, tz, isSelf }: Owner, from: Date, to: Date): Promise<DatedItem[]> {
    const range = { gte: from, lt: to };
    const [solves, study, lessons, tasks, work, interviews] = await Promise.all([
      this.prisma.debugAttempt.findMany({
        where: { userId, solvedAt: range },
        select: { exerciseSlug: true, solvedAt: true, durationSec: true },
      }),
      this.prisma.studyTime.findMany({
        where: { userId, day: { gte: dayKey(from, tz), lte: dayKey(to, tz) } },
        select: {
          day: true,
          seconds: true,
          enrollment: { select: { course: { select: { slug: true, title: true } } } },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { enrollment: { userId }, completedAt: range },
        select: { completedAt: true, enrollment: { select: { course: { select: { slug: true } } } } },
      }),
      this.prisma.task.findMany({
        where: { assigneeId: userId, status: TaskStatus.DONE, completedAt: range },
        select: { number: true, title: true, completedAt: true, project: { select: { slug: true, title: true } } },
      }),
      this.prisma.projectActivity.findMany({
        where: { actorUserId: userId, actorKind: ActorKind.USER, createdAt: range },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true, summary: true, project: { select: { slug: true, title: true } } },
      }),
      this.prisma.interviewSession.findMany({
        where: { application: { userId }, submittedAt: range },
        select: {
          submittedAt: true,
          application: {
            select: { id: true, role: { select: { title: true } }, project: { select: { title: true } } },
          },
        },
      }),
    ]);

    const lessonsDone = new Map<string, number>();
    for (const l of lessons) {
      const key = `${dayKey(l.completedAt, tz)}|${l.enrollment.course.slug}`;
      lessonsDone.set(key, (lessonsDone.get(key) ?? 0) + 1);
    }

    return [
      ...solves.flatMap((s): DatedItem[] => {
        const ex = findExercise(s.exerciseSlug);
        if (!ex) return [];
        return [
          {
            date: dayKey(s.solvedAt!, tz),
            item: {
              kind: 'DEBUG',
              title: `Fixed “${ex.title}”`,
              detail: [DEBUG_LEVEL_LABEL[ex.level], `${ex.bugs.length} bugs`, formatDuration(s.durationSec)]
                .filter(Boolean)
                .join(' · '),
              link: `/debug/${ex.slug}`,
            },
          },
        ];
      }),
      ...studyItems(
        study.map((s) => ({ day: s.day, seconds: s.seconds, course: s.enrollment.course })),
        lessonsDone,
      ),
      ...tasks.map((t): DatedItem => ({
        date: dayKey(t.completedAt!, tz),
        item: {
          kind: 'TASK',
          title: `Completed ${taskKey(t.number)}: ${t.title}`,
          detail: t.project.title,
          link: `/projects/${t.project.slug}/workspace`,
        },
      })),
      ...projectItems(work.map((w) => ({ date: dayKey(w.createdAt, tz), project: w.project, summary: w.summary }))),
      ...interviews.map((i): DatedItem => ({
        date: dayKey(i.submittedAt!, tz),
        item: {
          kind: 'INTERVIEW',
          title: 'Took an AI interview',
          detail: `${i.application.role.title} · ${i.application.project.title}`,
          // Applications are private: only the owner gets a link.
          link: isSelf ? `/applications/${i.application.id}` : null,
        },
      })),
    ];
  }
}
