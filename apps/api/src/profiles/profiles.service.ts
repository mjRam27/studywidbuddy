import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Profile as ProfileRow, Visibility } from '@prisma/client';
import { progressPercent } from '../enrollments/enrollment-rules';
import type { Profile } from '@studywidbuddy/shared';
import { AuthUser } from '../common/auth/auth-user';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { SkillsService } from '../skills/skills.service';
import { UpdateProfileDto } from './dto';

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly skills: SkillsService,
  ) {}

  async getOwn(userId: string): Promise<Profile> {
    const row = await this.prisma.profile.findUnique({ where: { userId } });
    if (!row) throw notFound('Profile');
    return this.toView(row, true);
  }

  /**
   * Visibility rules (server-side):
   *  - PUBLIC: any signed-in user.
   *  - CONNECTIONS: the owner, plus accepted connections once the Connections module lands (M10).
   *    Until then, owner only — the safe default.
   *  - PRIVATE: the owner only.
   * A hidden profile returns 404 rather than 403 so its existence isn't revealed.
   */
  async getByUsername(username: string, viewer: AuthUser | undefined): Promise<Profile> {
    const row = await this.prisma.profile.findUnique({ where: { username } });
    if (!row) throw notFound('Profile');
    const isSelf = viewer?.id === row.userId;
    const canSee = isSelf || (row.visibility === Visibility.PUBLIC && !!viewer) || viewer?.role === 'ADMIN';
    if (!canSee) throw notFound('Profile');
    return this.toView(row, isSelf);
  }

  async update(userId: string, dto: UpdateProfileDto): Promise<Profile> {
    // The DTO is whitelisted by the validation pipe, so only these fields can arrive here.
    const row = await this.prisma.profile.update({
      where: { userId },
      data: {
        displayName: dto.displayName,
        headline: dto.headline,
        bio: dto.bio,
        location: dto.location,
        timezone: dto.timezone,
        languages: dto.languages,
        visibility: dto.visibility,
      },
    });
    return this.toView(row, true);
  }

  async completeOnboarding(userId: string): Promise<Profile> {
    const row = await this.prisma.profile.update({
      where: { userId },
      data: { onboardedAt: new Date() },
    });
    return this.toView(row, true);
  }

  /** Course activity shown on a profile. Only called after the visibility check passed. */
  private async learning(userId: string): Promise<Profile['learning']> {
    const rows = await this.prisma.enrollment.findMany({
      where: { userId, status: { in: [EnrollmentStatus.ACTIVE, EnrollmentStatus.COMPLETED] } },
      orderBy: [{ completedAt: 'desc' }, { startedAt: 'asc' }],
      select: {
        status: true,
        level: true,
        completedAt: true,
        _count: { select: { progress: true } },
        course: {
          select: { slug: true, title: true, modules: { select: { _count: { select: { lessons: true } } } } },
        },
      },
    });
    const active: Profile['learning']['active'] = [];
    const completed: Profile['learning']['completed'] = [];
    for (const r of rows) {
      const total = r.course.modules.reduce((n, m) => n + m._count.lessons, 0);
      if (r.status === EnrollmentStatus.COMPLETED && r.completedAt) {
        completed.push({
          courseSlug: r.course.slug,
          title: r.course.title,
          level: r.level,
          completedAt: r.completedAt.toISOString(),
        });
      } else {
        active.push({
          courseSlug: r.course.slug,
          title: r.course.title,
          level: r.level,
          progress: progressPercent(r._count.progress, total),
        });
      }
    }
    return { active, completed };
  }

  private async toView(row: ProfileRow, isSelf: boolean): Promise<Profile> {
    return {
      userId: row.userId,
      username: row.username,
      displayName: row.displayName,
      headline: row.headline,
      bio: row.bio,
      location: row.location,
      timezone: row.timezone,
      languages: row.languages,
      avatarUrl: row.avatarUrl,
      visibility: row.visibility,
      skills: await this.skills.listForUser(row.userId),
      isSelf,
      memberSince: row.createdAt.toISOString(),
      learning: await this.learning(row.userId),
    };
  }
}
