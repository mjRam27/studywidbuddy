import { bearer, createHarness, Harness, registerUser, resetDatabase } from './harness';

describe('profiles & skills (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
    await resetDatabase(h.prisma);
  });
  afterAll(() => h.close());

  it('updates own profile and ignores nothing silently', async () => {
    const u = await registerUser(h);
    const res = await h
      .http()
      .patch('/api/v1/me/profile')
      .set(bearer(u))
      .send({ headline: '  Backend developer  ', timezone: 'Europe/Berlin', languages: ['English'] })
      .expect(200);
    expect(res.body).toMatchObject({ headline: 'Backend developer', timezone: 'Europe/Berlin', isSelf: true });

    await h.http().patch('/api/v1/me/profile').set(bearer(u)).send({ timezone: 'Mars/Olympus' }).expect(400);
    await h.http().patch('/api/v1/me/profile').set(bearer(u)).send({ userId: 'someone-else' }).expect(400);
  });

  it('enforces profile visibility server-side', async () => {
    const owner = await registerUser(h);
    const viewer = await registerUser(h);
    const me = await h.http().get('/api/v1/me/profile').set(bearer(owner)).expect(200);

    await h.http().get(`/api/v1/profiles/${me.body.username}`).set(bearer(viewer)).expect(200);
    await h.http().patch('/api/v1/me/profile').set(bearer(owner)).send({ visibility: 'PRIVATE' }).expect(200);
    await h.http().get(`/api/v1/profiles/${me.body.username}`).set(bearer(viewer)).expect(404);
    const own = await h.http().get(`/api/v1/profiles/${me.body.username}`).set(bearer(owner)).expect(200);
    expect(own.body.isSelf).toBe(true);
  });

  it('manages claimed skills and rejects unknown ones', async () => {
    const skill = await h.prisma.skill.create({ data: { slug: 'nestjs-x', name: 'NestJS X', category: 'BACKEND' } });
    const u = await registerUser(h);
    const set = await h
      .http()
      .put(`/api/v1/me/skills/${skill.id}`)
      .set(bearer(u))
      .send({ level: 'INTERMEDIATE' })
      .expect(200);
    expect(set.body).toEqual([expect.objectContaining({ slug: 'nestjs-x', level: 'INTERMEDIATE', source: 'CLAIMED' })]);

    await h.http().put(`/api/v1/me/skills/${skill.id}`).set(bearer(u)).send({ level: 'EXPERT' }).expect(400);
    await h
      .http()
      .put('/api/v1/me/skills/00000000-0000-4000-8000-000000000000')
      .set(bearer(u))
      .send({ level: 'BEGINNER' })
      .expect(404);

    const removed = await h.http().delete(`/api/v1/me/skills/${skill.id}`).set(bearer(u)).expect(200);
    expect(removed.body).toEqual([]);

    const search = await h.http().get('/api/v1/skills?q=nest').set(bearer(u)).expect(200);
    expect(search.body.map((s: { slug: string }) => s.slug)).toContain('nestjs-x');
  });

  it('completes onboarding', async () => {
    const u = await registerUser(h);
    await h.http().post('/api/v1/me/onboarding/complete').set(bearer(u)).expect(201);
    const me = await h.http().get('/api/v1/auth/me').set(bearer(u)).expect(200);
    expect(me.body.onboarded).toBe(true);
  });
});
