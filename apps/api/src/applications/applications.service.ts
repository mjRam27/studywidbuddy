import { createHash } from 'node:crypto';
import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable } from '@nestjs/common';
import { ApplicationOutcomeReason, ApplicationStatus, Prisma, ProjectStatus, TeamMemberStatus } from '@prisma/client';
import { CV_MAX_BYTES, CV_PASS_SCORE, ErrorCode } from '@studywidbuddy/shared';
import type { ApplicationOutcomeView, ApplicationView, CvScreeningView } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { AuthUser } from '../common/auth/auth-user';
import { conflict, DomainError, forbidden, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { ATS_WEIGHTS } from '../interviews/scoring';
import { INTERVIEW_QUEUE } from '../queue/queue.module';
import { assertTransition } from './application-status';
import { CreateApplicationDto } from './dto';

/** Queued after an application is created; handled by the interview worker. */
export const JOB_CV_SCREEN = 'cv.screen';

export interface UploadedCv {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

const viewInclude = {
  project: { select: { id: true, slug: true, title: true, difficulty: true } },
  role: { select: { id: true, key: true, title: true } },
  events: { orderBy: { createdAt: 'asc' }, select: { toStatus: true, createdAt: true } },
  cv: { select: { fileName: true, sizeBytes: true } },
  screening: true,
  interview: {
    select: { id: true, status: true, scheduledFor: true, evaluation: { select: { overallScore: true } } },
  },
  member: { select: { status: true } },
} satisfies Prisma.ProjectApplicationInclude;

type ApplicationRow = Prisma.ProjectApplicationGetPayload<{ include: typeof viewInclude }>;

/** Live applications compete for a role's seats. */
export const LIVE_STATUSES: ApplicationStatus[] = [
  ApplicationStatus.SUBMITTED,
  ApplicationStatus.INTERVIEW_PENDING,
  ApplicationStatus.INTERVIEW_IN_PROGRESS,
  ApplicationStatus.UNDER_REVIEW,
];

const SEATED: TeamMemberStatus[] = [TeamMemberStatus.INVITED, TeamMemberStatus.ACTIVE];

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(INTERVIEW_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Apply with a CV. The CV is screened by the AI ATS in the background: ≥ 80 earns a voice
   * interview, anything lower ends with feedback and course suggestions.
   */
  async apply(
    userId: string,
    projectId: string,
    dto: CreateApplicationDto,
    cv: UploadedCv | undefined,
  ): Promise<ApplicationView> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { emailVerifiedAt: true } });
    // Applications start paid AI work, so we want a reachable, verified address first.
    if (!user.emailVerifiedAt) {
      throw new DomainError(ErrorCode.FORBIDDEN, 'Confirm your email address before applying.', HttpStatus.FORBIDDEN);
    }
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        status: true,
        difficulty: true,
        applicationDeadline: true,
        roles: { select: { id: true, seats: true } },
      },
    });
    if (!project) throw notFound('Project');
    if (project.status !== ProjectStatus.OPEN) {
      throw new DomainError(
        ErrorCode.PROJECT_NOT_OPEN,
        'This project isn’t accepting applications.',
        HttpStatus.CONFLICT,
      );
    }
    if (project.applicationDeadline && project.applicationDeadline <= new Date()) {
      throw new DomainError(
        ErrorCode.PROJECT_NOT_OPEN,
        'Applications for this project have closed.',
        HttpStatus.CONFLICT,
      );
    }
    const role = project.roles.find((r) => r.id === dto.roleId);
    if (!role) {
      throw new DomainError(
        ErrorCode.VALIDATION_FAILED,
        'That role isn’t part of this project.',
        HttpStatus.BAD_REQUEST,
      );
    }
    if ((await this.seatsTaken(this.prisma, role.id)) >= role.seats) {
      throw new DomainError(ErrorCode.ROLE_FILLED, 'This role is already filled.', HttpStatus.CONFLICT, {
        projects: await this.similarProjects(dto.roleId, projectId),
      });
    }

    // Entry-level projects skip CV matching: the voice interview alone decides. A CV is
    // optional there (kept for the team, not scored); everywhere else it's required.
    const entryLevel = project.difficulty === 'BEGINNER';
    const file = entryLevel && !cv?.size ? null : this.checkCv(cv);

    let id: string;
    try {
      id = (
        await this.prisma.projectApplication.create({
          data: {
            projectId,
            roleId: dto.roleId,
            userId,
            motivation: dto.motivation,
            availabilityHoursPerWeek: dto.availabilityHoursPerWeek,
            relevantExperience: dto.relevantExperience ?? null,
            ...(entryLevel
              ? {
                  status: ApplicationStatus.INTERVIEW_PENDING,
                  events: {
                    create: [
                      { toStatus: ApplicationStatus.SUBMITTED, actorUserId: userId },
                      {
                        fromStatus: ApplicationStatus.SUBMITTED,
                        toStatus: ApplicationStatus.INTERVIEW_PENDING,
                        createdAt: new Date(Date.now() + 1),
                      },
                    ],
                  },
                  interview: { create: { status: 'AWAITING_SCHEDULE' } },
                }
              : {
                  events: { create: { toStatus: ApplicationStatus.SUBMITTED, actorUserId: userId } },
                  screening: { create: {} },
                }),
            ...(file ? { cv: { create: file } } : {}),
          },
          select: { id: true },
        })
      ).id;
    } catch (e) {
      // Partial unique index: one live application per user per project.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw conflict(ErrorCode.ALREADY_APPLIED, 'You’ve already applied to this project.');
      }
      throw e;
    }
    if (!entryLevel) await this.enqueueScreen(id);
    return this.view(id);
  }

  private checkCv(cv: UploadedCv | undefined) {
    if (!cv || !cv.size) {
      throw new DomainError(ErrorCode.CV_REQUIRED, 'Attach your CV as a PDF.', HttpStatus.BAD_REQUEST);
    }
    if (cv.size > CV_MAX_BYTES) {
      throw new DomainError(ErrorCode.CV_INVALID, 'Your CV must be 5 MB or smaller.', HttpStatus.BAD_REQUEST);
    }
    // Trust the bytes, not the browser's label: every PDF starts with "%PDF-".
    if (cv.buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new DomainError(
        ErrorCode.CV_INVALID,
        'That file isn’t a PDF. Export your CV as PDF and try again.',
        HttpStatus.BAD_REQUEST,
      );
    }
    const fileName = (cv.originalname || 'cv.pdf').replace(/[^\w.\- ()]+/g, '_').slice(0, 120);
    return {
      fileName: fileName.toLowerCase().endsWith('.pdf') ? fileName : `${fileName}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: cv.size,
      sha256: createHash('sha256').update(cv.buffer).digest('hex'),
      data: new Uint8Array(cv.buffer),
    };
  }

  async enqueueScreen(applicationId: string, suffix = 'initial') {
    await this.queue.add(JOB_CV_SCREEN, { applicationId }, { jobId: `${JOB_CV_SCREEN}-${applicationId}-${suffix}` });
  }

  /** Re-runs a CV screening that failed (e.g. the AI was unavailable). */
  async retryScreen(userId: string, id: string): Promise<ApplicationView> {
    const s = await this.prisma.cvScreening.findUnique({
      where: { applicationId: id },
      select: { status: true, application: { select: { userId: true } } },
    });
    if (!s || s.application.userId !== userId) throw notFound('Application');
    if (s.status !== 'FAILED') {
      throw new DomainError(ErrorCode.CONFLICT, 'This CV screening didn’t fail.', HttpStatus.CONFLICT);
    }
    await this.prisma.cvScreening.update({
      where: { applicationId: id },
      data: { status: 'PENDING', failureReason: null },
    });
    await this.enqueueScreen(id, `retry-${Date.now()}`);
    return this.view(id);
  }

  async cvFile(viewer: AuthUser, id: string) {
    const cv = await this.prisma.applicationCv.findUnique({
      where: { applicationId: id },
      include: { application: { select: { userId: true } } },
    });
    if (!cv || (cv.application.userId !== viewer.id && viewer.role !== 'ADMIN')) throw notFound('CV');
    return { fileName: cv.fileName, data: Buffer.from(cv.data) };
  }

  async listMine(userId: string): Promise<ApplicationView[]> {
    const rows = await this.prisma.projectApplication.findMany({
      where: { userId },
      orderBy: { submittedAt: 'desc' },
      include: viewInclude,
    });
    return Promise.all(rows.map((r) => this.toView(r)));
  }

  async get(viewer: AuthUser, id: string): Promise<ApplicationView> {
    const row = await this.prisma.projectApplication.findUnique({ where: { id }, include: viewInclude });
    if (!row) throw notFound('Application');
    if (row.userId !== viewer.id && viewer.role !== 'ADMIN') throw notFound('Application');
    return this.toView(row);
  }

  async view(id: string): Promise<ApplicationView> {
    return this.toView(await this.prisma.projectApplication.findUniqueOrThrow({ where: { id }, include: viewInclude }));
  }

  async withdraw(userId: string, id: string): Promise<ApplicationView> {
    return this.transition(id, ApplicationStatus.WITHDRAWN, userId, (row) => {
      if (row.userId !== userId) throw notFound('Application');
    });
  }

  /**
   * Single entry point for status changes: checks the state machine, updates with an
   * optimistic guard on the previous status, and appends the history event atomically.
   */
  async transition(
    id: string,
    to: ApplicationStatus,
    actorUserId: string | null,
    authorize: (row: { userId: string; status: ApplicationStatus }) => void = () => {
      throw forbidden();
    },
    outcome?: { reason: ApplicationOutcomeReason; feedback: string | null },
  ): Promise<ApplicationView> {
    await this.prisma.$transaction((tx) => this.transitionIn(tx, id, to, actorUserId, authorize, outcome));
    return this.view(id);
  }

  /** The same state-machine step, inside a caller's transaction (e.g. assigning a seat). */
  async transitionIn(
    tx: Prisma.TransactionClient,
    id: string,
    to: ApplicationStatus,
    actorUserId: string | null,
    authorize: (row: { userId: string; status: ApplicationStatus }) => void = () => {
      throw forbidden();
    },
    outcome?: { reason: ApplicationOutcomeReason; feedback: string | null },
  ): Promise<void> {
    const row = await tx.projectApplication.findUnique({ where: { id }, select: { userId: true, status: true } });
    if (!row) throw notFound('Application');
    authorize(row);
    assertTransition(row.status, to);
    const updated = await tx.projectApplication.updateMany({
      where: { id, status: row.status },
      data: {
        status: to,
        ...(outcome ? { outcomeReason: outcome.reason, outcomeFeedback: outcome.feedback } : {}),
      },
    });
    if (updated.count !== 1) {
      throw new DomainError(
        ErrorCode.CONFLICT,
        'This application just changed. Refresh and try again.',
        HttpStatus.CONFLICT,
      );
    }
    await tx.applicationEvent.create({
      data: { applicationId: id, fromStatus: row.status, toStatus: to, actorUserId },
    });
  }

  // ───────── seats ─────────

  seatsTaken(tx: Prisma.TransactionClient, roleId: string) {
    return tx.teamMember.count({ where: { roleId, status: { in: SEATED } } });
  }

  /** Open projects with a free seat in a role like this one (same key or title). */
  async similarProjects(roleId: string, excludeProjectId: string) {
    const role = await this.prisma.projectRole.findUniqueOrThrow({
      where: { id: roleId },
      select: { key: true, title: true },
    });
    const roles = await this.prisma.projectRole.findMany({
      where: {
        projectId: { not: excludeProjectId },
        project: { status: ProjectStatus.OPEN },
        OR: [{ key: role.key }, { title: { equals: role.title, mode: 'insensitive' } }],
      },
      orderBy: { project: { createdAt: 'desc' } },
      select: {
        id: true,
        title: true,
        seats: true,
        project: { select: { slug: true, title: true } },
        _count: { select: { members: { where: { status: { in: SEATED } } } } },
      },
      take: 20,
    });
    return roles
      .map((r) => ({
        slug: r.project.slug,
        title: r.project.title,
        roleTitle: r.title,
        open: r.seats - r._count.members,
      }))
      .filter((r) => r.open > 0)
      .slice(0, 5);
  }

  /** Published courses teaching the role's skills the candidate lacks (missing first). */
  private async recommendedCourses(roleId: string, missing: string[]) {
    const required = await this.prisma.projectRequiredSkill.findMany({
      where: { roleId },
      select: { skill: { select: { id: true, name: true } } },
    });
    const missingIds = required
      .filter((r) => missing.some((m) => m.toLowerCase() === r.skill.name.toLowerCase()))
      .map((r) => r.skill.id);
    const targetIds = missingIds.length ? missingIds : required.map((r) => r.skill.id);
    if (!targetIds.length) return [];
    const courses = await this.prisma.course.findMany({
      where: { publishedAt: { not: null }, skills: { some: { skillId: { in: targetIds } } } },
      select: { slug: true, title: true, skills: { select: { skill: { select: { id: true, name: true } } } } },
      take: 8,
    });
    return courses
      .map((c) => {
        const covers = c.skills.filter((s) => targetIds.includes(s.skill.id)).map((s) => s.skill.name);
        return { slug: c.slug, title: c.title, reason: `Teaches ${covers.join(', ')}`, n: covers.length };
      })
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map(({ n: _n, ...c }) => c);
  }

  private async outcome(r: ApplicationRow): Promise<ApplicationOutcomeView | null> {
    if (!r.outcomeReason) return null;
    const missing = r.screening?.missingSkills ?? [];
    return {
      reason: r.outcomeReason,
      feedback: r.outcomeFeedback,
      courses: r.outcomeReason === 'ROLE_FILLED' ? [] : await this.recommendedCourses(r.roleId, missing),
      projects: await this.similarProjects(r.roleId, r.projectId),
    };
  }

  private screening(r: ApplicationRow): CvScreeningView | null {
    const s = r.screening;
    if (!s) return null;
    const done = s.status === 'DONE';
    return {
      status: s.status,
      atsScore: done ? s.atsScore : null,
      passScore: CV_PASS_SCORE,
      breakdown: done
        ? (Object.keys(ATS_WEIGHTS) as (keyof typeof ATS_WEIGHTS)[]).map((k) => ({
            label: ATS_WEIGHTS[k].label,
            score: s[k] ?? 0,
            weight: ATS_WEIGHTS[k].weight,
          }))
        : [],
      matchedSkills: done ? s.matchedSkills : [],
      missingSkills: done ? s.missingSkills : [],
      feedback: done ? s.feedback : null,
      failureMessage: s.status === 'FAILED' ? 'We couldn’t screen your CV. You can try again.' : null,
    };
  }

  private async toView(r: ApplicationRow): Promise<ApplicationView> {
    return {
      id: r.id,
      status: r.status,
      motivation: r.motivation,
      availabilityHoursPerWeek: r.availabilityHoursPerWeek,
      relevantExperience: r.relevantExperience,
      submittedAt: r.submittedAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      project: r.project,
      role: r.role,
      history: r.events.map((e) => ({ status: e.toStatus, at: e.createdAt.toISOString() })),
      cv: r.cv,
      screening: this.screening(r),
      interview: r.interview
        ? {
            id: r.interview.id,
            status: r.interview.status,
            scheduledFor: r.interview.scheduledFor?.toISOString() ?? null,
            overallScore: r.interview.evaluation?.overallScore ?? null,
          }
        : null,
      outcome: await this.outcome(r),
      seat:
        r.status === ApplicationStatus.SELECTED && r.member
          ? { projectSlug: r.project.slug, roleTitle: r.role.title }
          : null,
    };
  }
}
