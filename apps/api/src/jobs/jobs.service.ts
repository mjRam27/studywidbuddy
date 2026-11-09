import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { type JobSource, Prisma, SkillSource } from '@prisma/client';
import type { JobDetail, JobListQuery, JobListResponse, JobSummary } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { ENV, type Env } from '../common/config/env';
import { notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { JOBS_QUEUE } from '../queue/queue.module';
import { JobFeedClient, type NormalizedJob } from './job-feeds';
import { dedupeKey, matchJob, skillMatcher, type ViewerSkill } from './job-skills';

export const JOB_SYNC = 'jobs.sync';
const SCHEDULER_ID = 'jobs-sync-schedule';
const PAGE_SIZE = 20;
/** Matching happens in code over the most recent listings that pass the filters. */
const CANDIDATES = 400;
/** Listings not seen in a feed for this long, or this old, are hidden. */
const STALE_DAYS = 3;
const MAX_AGE_DAYS = 45;
const DAY = 86_400_000;
const LEVEL_RANK = { BEGINNER: 0, INTERMEDIATE: 1, ADVANCED: 2 } as const;

const jobInclude = {
  skills: { include: { skill: { select: { id: true, name: true } } } },
} satisfies Prisma.JobPostingInclude;
type JobRow = Prisma.JobPostingGetPayload<{ include: typeof jobInclude }>;

export interface SyncResult {
  fetched: number;
  saved: number;
  /** No catalogue skill in the listing (not a tech job we can match). */
  irrelevant: number;
  duplicates: number;
  hidden: number;
  failed: JobSource[];
}

/**
 * Job listings matched to what people have shown. A background job pulls listings from the
 * public job-board APIs (job-feeds.ts) every few hours, tags them with catalogue skills by
 * code and stores them; the Jobs pages rank them per viewer with an explanation. Apply always
 * links to the original posting.
 */
@Injectable()
export class JobsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly feeds: JobFeedClient,
    @Inject(ENV) private readonly env: Env,
    @InjectQueue(JOBS_QUEUE) private readonly queue: Queue,
  ) {}

  /** Schedules the periodic refresh, and fills an empty board straight away. */
  async onApplicationBootstrap() {
    if (this.env.NODE_ENV === 'test' || !this.env.JOBS_SYNC_HOURS) return;
    try {
      await this.queue.upsertJobScheduler(
        SCHEDULER_ID,
        { every: this.env.JOBS_SYNC_HOURS * 3_600_000 },
        { name: JOB_SYNC, data: {} },
      );
      if ((await this.prisma.jobPosting.count({ where: { active: true } })) === 0) await this.requestSync();
    } catch (e) {
      this.logger.warn(`Job sync not scheduled: ${(e as Error).message}`);
    }
  }

  /** Admin "Sync now". Collapses repeated clicks within a minute into one job. */
  async requestSync(): Promise<{ queued: true }> {
    await this.queue.add(JOB_SYNC, {}, { jobId: `${JOB_SYNC}-${Math.floor(Date.now() / 60_000)}`, attempts: 1 });
    return { queued: true };
  }

  // ───────── sync (worker) ─────────

  async sync(): Promise<SyncResult> {
    const detect = skillMatcher(await this.prisma.skill.findMany({ select: { id: true, name: true } }));
    const result: SyncResult = { fetched: 0, saved: 0, irrelevant: 0, duplicates: 0, hidden: 0, failed: [] };
    for (const source of this.feeds.sources()) {
      let jobs: NormalizedJob[];
      try {
        jobs = await this.feeds.fetch(source);
      } catch (e) {
        // One source being down shouldn't stop the others.
        this.logger.warn(`Job source ${source} failed: ${(e as Error).message}`);
        result.failed.push(source);
        continue;
      }
      result.fetched += jobs.length;
      const tagged = jobs
        .map((j) => ({ job: j, key: dedupeKey(j.company, j.title, j.location), skills: detect(j) }))
        .filter((t) => (t.skills.length ? true : (result.irrelevant++, false)));
      // The same job from another source (or twice in one feed): first one wins.
      const taken = new Map(
        (
          await this.prisma.jobPosting.findMany({
            where: { dedupeKey: { in: tagged.map((t) => t.key) } },
            select: { dedupeKey: true, source: true, externalId: true },
          })
        ).map((r) => [r.dedupeKey, `${r.source}:${r.externalId}`]),
      );
      for (const t of tagged) {
        const id = `${t.job.source}:${t.job.externalId}`;
        const owner = taken.get(t.key);
        if (owner && owner !== id) {
          result.duplicates++;
          continue;
        }
        taken.set(t.key, id);
        await this.save(t.job, t.key, t.skills);
        result.saved++;
      }
    }
    const now = Date.now();
    const hidden = await this.prisma.jobPosting.updateMany({
      where: {
        active: true,
        // Only hide listings from sources that answered this time.
        source: { notIn: result.failed },
        OR: [
          { fetchedAt: { lt: new Date(now - STALE_DAYS * DAY) } },
          { postedAt: { lt: new Date(now - MAX_AGE_DAYS * DAY) } },
        ],
      },
      data: { active: false },
    });
    result.hidden = hidden.count;
    this.logger.log(`Job sync: ${JSON.stringify(result)}`);
    return result;
  }

  private async save(j: NormalizedJob, key: string, skillIds: string[]) {
    const data = {
      dedupeKey: key,
      url: j.url,
      title: j.title.slice(0, 300),
      company: j.company.slice(0, 200),
      location: j.location.slice(0, 200),
      remote: j.remote,
      employment: j.employment?.slice(0, 120) ?? null,
      description: j.description,
      tags: j.tags.map((t) => t.slice(0, 60)),
      postedAt: Number.isNaN(j.postedAt.getTime()) ? new Date() : j.postedAt,
      fetchedAt: new Date(),
      active: true,
    };
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.jobPosting.upsert({
        where: { source_externalId: { source: j.source, externalId: j.externalId } },
        create: { source: j.source, externalId: j.externalId, ...data },
        update: data,
        select: { id: true },
      });
      await tx.jobSkill.deleteMany({ where: { jobId: row.id } });
      await tx.jobSkill.createMany({ data: skillIds.map((skillId) => ({ jobId: row.id, skillId })) });
    });
  }

  // ───────── reading ─────────

  async list(userId: string, query: JobListQuery): Promise<JobListResponse> {
    const mine = await this.viewerSkills(userId);
    const scope = query.scope ?? 'matched';
    const q = query.q?.trim().slice(0, 100);
    const [rows, last] = await Promise.all([
      scope === 'matched' && !mine.size
        ? Promise.resolve([] as JobRow[])
        : this.prisma.jobPosting.findMany({
            where: {
              active: true,
              ...(query.remote ? { remote: true } : {}),
              ...(q
                ? {
                    OR: [
                      { title: { contains: q, mode: 'insensitive' } },
                      { company: { contains: q, mode: 'insensitive' } },
                      { location: { contains: q, mode: 'insensitive' } },
                      { skills: { some: { skill: { name: { equals: q, mode: 'insensitive' } } } } },
                    ],
                  }
                : {}),
              ...(scope === 'matched' ? { skills: { some: { skillId: { in: [...mine.keys()] } } } } : {}),
            },
            orderBy: { postedAt: 'desc' },
            take: CANDIDATES,
            include: jobInclude,
          }),
      this.prisma.jobPosting.aggregate({ _max: { fetchedAt: true } }),
    ]);
    const ranked = rows
      .map((r) => this.toSummary(r, mine))
      .sort((a, b) => (b.match.score ?? -1) - (a.match.score ?? -1) || b.postedAt.localeCompare(a.postedAt));
    const offset = Math.max(0, Number(query.cursor) || 0);
    const items = ranked.slice(offset, offset + PAGE_SIZE);
    return {
      items,
      nextCursor: offset + PAGE_SIZE < ranked.length ? String(offset + PAGE_SIZE) : null,
      lastSyncAt: last._max.fetchedAt?.toISOString() ?? null,
      noSkills: mine.size === 0,
    };
  }

  async detail(userId: string, id: string): Promise<JobDetail> {
    const row = await this.prisma.jobPosting.findUnique({ where: { id }, include: jobInclude });
    if (!row) throw notFound('Job');
    const mine = await this.viewerSkills(userId);
    const summary = this.toSummary(row, mine);
    const gapIds = row.skills.filter((s) => !mine.has(s.skillId)).map((s) => s.skillId);
    const courses = gapIds.length
      ? await this.prisma.course.findMany({
          where: { publishedAt: { not: null }, skills: { some: { skillId: { in: gapIds } } } },
          select: { slug: true, title: true, skills: { select: { skill: { select: { id: true, name: true } } } } },
          take: 12,
        })
      : [];
    return {
      ...summary,
      description: row.description,
      tags: row.tags,
      courses: courses
        .map((c) => ({
          slug: c.slug,
          title: c.title,
          covers: c.skills.filter((s) => gapIds.includes(s.skill.id)).map((s) => s.skill.name),
        }))
        .sort((a, b) => b.covers.length - a.covers.length)
        .slice(0, 4),
    };
  }

  /** The viewer's skills: proven if any source is DEMONSTRATED; the highest level wins. */
  private async viewerSkills(userId: string): Promise<Map<string, ViewerSkill>> {
    const rows = await this.prisma.userSkill.findMany({
      where: { userId },
      select: { skillId: true, source: true, level: true },
    });
    const out = new Map<string, ViewerSkill>();
    for (const r of rows) {
      const prev = out.get(r.skillId);
      out.set(r.skillId, {
        proven: !!prev?.proven || r.source === SkillSource.DEMONSTRATED,
        level: prev && LEVEL_RANK[prev.level] >= LEVEL_RANK[r.level] ? prev.level : r.level,
      });
    }
    return out;
  }

  private toSummary(r: JobRow, mine: Map<string, ViewerSkill>): JobSummary {
    const skills = r.skills.map((s) => s.skill).sort((a, b) => a.name.localeCompare(b.name));
    return {
      id: r.id,
      title: r.title,
      company: r.company,
      location: r.location,
      remote: r.remote,
      employment: r.employment,
      postedAt: r.postedAt.toISOString(),
      source: r.source,
      url: r.url,
      skills: skills.map((s) => s.name),
      match: matchJob(skills, mine),
    };
  }
}
