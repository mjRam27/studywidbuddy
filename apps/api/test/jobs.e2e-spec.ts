import type { JobSource } from '@prisma/client';
import { JobFeedClient, type NormalizedJob } from '../src/jobs/job-feeds';
import { JobsService } from '../src/jobs/jobs.service';
import {
  bearer,
  createHarness,
  type Harness,
  registerUser,
  resetDatabase,
  type TestUser,
  uniq,
  waitFor,
} from './harness';

/** TEST ONLY. Serves scripted listings per source; a source can be made to fail. */
class FakeJobFeedClient extends JobFeedClient {
  feeds = new Map<JobSource, NormalizedJob[] | Error>();
  sources(): JobSource[] {
    return [...this.feeds.keys()];
  }
  async fetch(source: JobSource) {
    const f = this.feeds.get(source);
    if (f instanceof Error) throw f;
    return f ?? [];
  }
}

const listing = (over: Partial<NormalizedJob> & { externalId: string; title: string }): NormalizedJob => ({
  source: 'ARBEITNOW',
  url: `https://www.arbeitnow.com/jobs/${over.externalId}`,
  company: 'Parcelo',
  location: 'Berlin',
  remote: false,
  employment: 'full time',
  description: '',
  tags: [],
  postedAt: new Date(),
  ...over,
});

describe('Jobs (e2e)', () => {
  let h: Harness;
  const feeds = new FakeJobFeedClient();
  let me: TestUser;
  let admin: TestUser;
  const skill: Record<string, string> = {};

  beforeAll(async () => {
    h = await createHarness({ overrides: [[JobFeedClient, feeds]] });
    await resetDatabase(h.prisma);
    for (const name of ['TypeScript', 'PostgreSQL', 'Kubernetes', 'Node.js', 'Terraform']) {
      skill[name] = (await h.prisma.skill.create({ data: { slug: uniq('sk-'), name, category: 'BACKEND' } })).id;
    }
    await h.prisma.course.create({
      data: {
        slug: uniq('k8s-'),
        title: 'Kubernetes Basics',
        summary: 's',
        description: 'd',
        category: 'DEVOPS',
        level: 'BEGINNER',
        estimatedHours: 5,
        publishedAt: new Date(),
        skills: { create: [{ skillId: skill.Kubernetes }] },
      },
    });
    [me, admin] = await Promise.all([registerUser(h), registerUser(h)]);
    await h.prisma.userSkill.createMany({
      data: [
        { userId: me.id, skillId: skill.TypeScript, source: 'DEMONSTRATED', level: 'INTERMEDIATE' },
        { userId: me.id, skillId: skill['Node.js'], source: 'DEMONSTRATED', level: 'BEGINNER' },
        { userId: me.id, skillId: skill.PostgreSQL, source: 'CLAIMED', level: 'BEGINNER' },
      ],
    });
    await h.prisma.user.update({ where: { id: admin.id }, data: { role: 'ADMIN' } });
    admin.token = (
      await h.http().post('/api/v1/auth/login').send({ email: admin.email, password: admin.password }).expect(200)
    ).body.accessToken;
  });
  afterAll(() => h.close());

  it('syncs, tags, dedupes and ranks listings by match, explaining each one', async () => {
    feeds.feeds.set('ARBEITNOW', [
      listing({
        externalId: 'backend-1',
        title: 'Backend Software Engineer',
        description: 'TypeScript, Node.js and Postgres. Some Kubernetes.',
      }),
      listing({
        externalId: 'platform-1',
        title: 'Junior Platform Engineer',
        description: 'Terraform and k8s',
        remote: true,
      }),
      listing({ externalId: 'sales-1', title: 'Sales Manager', description: 'Grow our accounts' }),
    ]);
    feeds.feeds.set('ADZUNA', [
      // The same job as backend-1, posted through another board.
      listing({ source: 'ADZUNA', externalId: 'in:9', title: 'Backend Software Engineer', description: 'TypeScript' }),
      listing({
        source: 'ADZUNA',
        externalId: 'in:10',
        title: 'API Developer',
        company: 'Finomo',
        location: 'Pune',
        description: 'Node.js, PostgreSQL',
      }),
    ]);
    const result = await h.app.get(JobsService).sync();
    expect(result).toMatchObject({ fetched: 5, saved: 3, irrelevant: 1, duplicates: 1, failed: [] });

    const list = (await h.http().get('/api/v1/jobs').set(bearer(me)).expect(200)).body;
    expect(list.noSkills).toBe(false);
    expect(list.lastSyncAt).toBeTruthy();
    // Matched scope hides the platform job: it shares no skill with me.
    expect(list.items.map((j: { title: string; match: { score: number } }) => [j.title, j.match.score])).toEqual([
      ['API Developer', 80], // Node.js proven (1) + PostgreSQL claimed (0.6) of 2
      ['Backend Software Engineer', 65], // TS + Node proven, PG claimed, Kubernetes gap
    ]);
    const backend = list.items[1];
    expect(backend).toMatchObject({
      company: 'Parcelo',
      source: 'ARBEITNOW',
      url: 'https://www.arbeitnow.com/jobs/backend-1',
      match: { gaps: ['Kubernetes'] },
    });

    const all = (await h.http().get('/api/v1/jobs?scope=all&remote=true').set(bearer(me)).expect(200)).body;
    expect(all.items.map((j: { title: string }) => j.title)).toEqual(['Junior Platform Engineer']);
    expect(all.items[0].match).toMatchObject({ score: 0, gaps: ['Kubernetes', 'Terraform'] });

    const detail = (await h.http().get(`/api/v1/jobs/${backend.id}`).set(bearer(me)).expect(200)).body;
    expect(detail.description).toBe('TypeScript, Node.js and Postgres. Some Kubernetes.');
    expect(detail.courses).toEqual([expect.objectContaining({ title: 'Kubernetes Basics', covers: ['Kubernetes'] })]);
  });

  it('keeps listings when a source is down, and hides ones that go stale', async () => {
    feeds.feeds.set('ARBEITNOW', new Error('arbeitnow answered 503'));
    await h.prisma.jobPosting.updateMany({ data: { fetchedAt: new Date(Date.now() - 5 * 86_400_000) } });
    const r = await h.app.get(JobsService).sync();
    expect(r.failed).toEqual(['ARBEITNOW']);
    // Adzuna answered, so its listings stay fresh; Arbeitnow's are kept because it failed.
    expect(await h.prisma.jobPosting.count({ where: { active: true } })).toBe(3);

    feeds.feeds.set('ARBEITNOW', []);
    await h.prisma.jobPosting.updateMany({ data: { fetchedAt: new Date(Date.now() - 5 * 86_400_000) } });
    feeds.feeds.delete('ADZUNA');
    await h.app.get(JobsService).sync();
    expect(await h.prisma.jobPosting.count({ where: { active: true } })).toBe(0);
  });

  it('asks people with no skills to add some; only admins can force a sync', async () => {
    const fresh = await registerUser(h);
    const r = (await h.http().get('/api/v1/jobs').set(bearer(fresh)).expect(200)).body;
    expect(r).toMatchObject({ items: [], noSkills: true });
    await h.http().post('/api/v1/admin/jobs/sync').set(bearer(fresh)).expect(403);
    feeds.feeds.set('ARBEITNOW', [listing({ externalId: 'again-1', title: 'TypeScript Developer' })]);
    await h.http().post('/api/v1/admin/jobs/sync').set(bearer(admin)).expect(202);
    await waitFor(
      async () => (await h.prisma.jobPosting.count({ where: { externalId: 'again-1', active: true } })) === 1,
    );
    await h.http().get('/api/v1/jobs/not-a-uuid').set(bearer(me)).expect(400);
  });
});
