import { Injectable } from '@nestjs/common';
import { EnrollmentStatus, Prisma } from '@prisma/client';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { dayKey, safeTimeZone } from './learning-stats';
import { studyCredit } from './study-time';

/** Records active study time per enrollment and local day (feeds the profile's activity graph). */
@Injectable()
export class StudyTimeService {
  constructor(private readonly prisma: PrismaService) {}

  async beat(userId: string, enrollmentId: string, now = new Date()): Promise<void> {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { userId: true, status: true, user: { select: { profile: { select: { timezone: true } } } } },
    });
    if (!enrollment || enrollment.userId !== userId) throw notFound('Enrollment');
    if (enrollment.status !== EnrollmentStatus.ACTIVE) return;
    const day = dayKey(now, safeTimeZone(enrollment.user.profile?.timezone));
    const key = { userId_enrollmentId_day: { userId, enrollmentId, day } };
    const row = await this.prisma.studyTime.findUnique({ where: key });
    if (!row) {
      try {
        await this.prisma.studyTime.create({
          data: { userId, enrollmentId, day, seconds: studyCredit(null, now), lastBeatAt: now },
        });
      } catch (e) {
        // A beat from another tab created the row first: that one counts.
        if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
      }
      return;
    }
    const credit = studyCredit(row.lastBeatAt, now);
    if (!credit) return;
    // Guarded on the previous beat so concurrent beats are counted once.
    await this.prisma.studyTime.updateMany({
      where: { userId, enrollmentId, day, lastBeatAt: row.lastBeatAt },
      data: { seconds: { increment: credit }, lastBeatAt: now },
    });
  }
}
