import { Injectable } from '@nestjs/common';
import { SkillLevel, SkillSource } from '@prisma/client';
import type { ProfileSkill, Skill } from '@studywidbuddy/shared';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  async search(q: string | undefined, limit = 20): Promise<Skill[]> {
    const term = q?.trim();
    return this.prisma.skill.findMany({
      where: term ? { name: { contains: term, mode: 'insensitive' } } : undefined,
      orderBy: { name: 'asc' },
      take: Math.min(limit, 100),
      select: { id: true, slug: true, name: true, category: true },
    });
  }

  async listForUser(userId: string): Promise<ProfileSkill[]> {
    const rows = await this.prisma.userSkill.findMany({
      where: { userId },
      include: { skill: true },
      orderBy: [{ source: 'desc' }, { skill: { name: 'asc' } }],
    });
    return rows.map((r) => ({
      skillId: r.skillId,
      slug: r.skill.slug,
      name: r.skill.name,
      level: r.level,
      source: r.source,
    }));
  }

  /** Users can only set CLAIMED skills. DEMONSTRATED ones are written by course/project completion. */
  async setClaimed(userId: string, skillId: string, level: SkillLevel): Promise<ProfileSkill[]> {
    const skill = await this.prisma.skill.findUnique({ where: { id: skillId }, select: { id: true } });
    if (!skill) throw notFound('Skill');
    await this.prisma.userSkill.upsert({
      where: { userId_skillId_source: { userId, skillId, source: SkillSource.CLAIMED } },
      create: { userId, skillId, level, source: SkillSource.CLAIMED },
      update: { level },
    });
    return this.listForUser(userId);
  }

  async removeClaimed(userId: string, skillId: string): Promise<ProfileSkill[]> {
    await this.prisma.userSkill.deleteMany({ where: { userId, skillId, source: SkillSource.CLAIMED } });
    return this.listForUser(userId);
  }
}
