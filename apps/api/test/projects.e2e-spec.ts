import { ErrorCode } from '@studywidbuddy/shared';
import { applyWith, bearer, createHarness, createProject, Harness, registerUser, resetDatabase } from './harness';

describe('projects & applications (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
    await resetDatabase(h.prisma);
  });
  afterAll(() => h.close());

  const application = (roleId: string) => ({
    roleId,
    motivation: 'I want to practise building realtime backends with a real team and real deadlines.',
    availabilityHoursPerWeek: 10,
  });

  it('lists open projects publicly and hides drafts', async () => {
    const open = await createProject(h.prisma);
    const draft = await createProject(h.prisma, { status: 'DRAFT' });
    const res = await h.http().get('/api/v1/projects').expect(200);
    const slugs = res.body.items.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(open.slug);
    expect(slugs).not.toContain(draft.slug);
    await h.http().get(`/api/v1/projects/${draft.slug}`).expect(404);
  });

  it('paginates with a cursor', async () => {
    for (let i = 0; i < 3; i++) await createProject(h.prisma);
    const first = await h.http().get('/api/v1/projects?limit=2').expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await h.http().get(`/api/v1/projects?limit=2&cursor=${first.body.nextCursor}`).expect(200);
    const ids = [...first.body.items, ...second.body.items].map((p: { id: string }) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('requires a verified email to apply', async () => {
    const project = await createProject(h.prisma);
    const u = await registerUser(h);
    const res = await applyWith(h, u, project.id, application(project.roles[0].id)).expect(403);
    expect(res.body.error.code).toBe(ErrorCode.FORBIDDEN);
  });

  it('runs apply → my applications → withdraw → re-apply', async () => {
    const project = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    const u = await registerUser(h, { verified: true });
    const created = await applyWith(h, u, project.id, application(project.roles[0].id)).expect(201);
    expect(created.body).toMatchObject({ status: 'SUBMITTED', role: { key: 'backend' } });
    expect(created.body.history).toEqual([expect.objectContaining({ status: 'SUBMITTED' })]);

    const dup = await applyWith(h, u, project.id, application(project.roles[1].id)).expect(409);
    expect(dup.body.error.code).toBe(ErrorCode.ALREADY_APPLIED);

    const detail = await h.http().get(`/api/v1/projects/${project.slug}`).set(bearer(u)).expect(200);
    expect(detail.body.myApplication).toMatchObject({ id: created.body.id, status: 'SUBMITTED' });

    const mine = await h.http().get('/api/v1/me/applications').set(bearer(u)).expect(200);
    expect(mine.body.map((a: { id: string }) => a.id)).toEqual([created.body.id]);

    const withdrawn = await h
      .http()
      .post(`/api/v1/applications/${created.body.id}/withdraw`)
      .set(bearer(u))
      .expect(200);
    expect(withdrawn.body.status).toBe('WITHDRAWN');
    expect(withdrawn.body.history.map((e: { status: string }) => e.status)).toEqual(['SUBMITTED', 'WITHDRAWN']);

    const again = await h.http().post(`/api/v1/applications/${created.body.id}/withdraw`).set(bearer(u)).expect(409);
    expect(again.body.error.code).toBe(ErrorCode.INVALID_STATUS_TRANSITION);

    await applyWith(h, u, project.id, application(project.roles[1].id)).expect(201);
  });

  it('keeps applications private to their owner', async () => {
    const project = await createProject(h.prisma);
    const owner = await registerUser(h, { verified: true });
    const other = await registerUser(h, { verified: true });
    const created = await applyWith(h, owner, project.id, application(project.roles[0].id)).expect(201);
    await h.http().get(`/api/v1/applications/${created.body.id}`).set(bearer(other)).expect(404);
    await h.http().post(`/api/v1/applications/${created.body.id}/withdraw`).set(bearer(other)).expect(404);
  });

  it('rejects roles from another project, closed projects and past deadlines', async () => {
    const u = await registerUser(h, { verified: true });
    const a = await createProject(h.prisma);
    const b = await createProject(h.prisma);
    await applyWith(h, u, a.id, application(b.roles[0].id)).expect(400);

    const running = await createProject(h.prisma, { status: 'IN_PROGRESS' });
    const closed = await applyWith(h, u, running.id, application(running.roles[0].id)).expect(409);
    expect(closed.body.error.code).toBe(ErrorCode.PROJECT_NOT_OPEN);

    const late = await createProject(h.prisma, { deadline: new Date(Date.now() - 1000) });
    await applyWith(h, u, late.id, application(late.roles[0].id)).expect(409);
  });

  it('requires a PDF CV and refuses roles that are already full', async () => {
    const project = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    const u = await registerUser(h, { verified: true });
    const none = await applyWith(h, u, project.id, application(project.roles[0].id), null).expect(400);
    expect(none.body.error.code).toBe(ErrorCode.CV_REQUIRED);
    const notPdf = await applyWith(h, u, project.id, application(project.roles[0].id), Buffer.from('hello')).expect(
      400,
    );
    expect(notPdf.body.error.code).toBe(ErrorCode.CV_INVALID);

    // Fill the frontend role's single seat, and open a similar role elsewhere.
    const frontend = project.roles.find((r) => r.key === 'frontend')!;
    const seated = await registerUser(h, { verified: true });
    const team = await h.prisma.team.create({ data: { projectId: project.id } });
    const app = await h.prisma.projectApplication.create({
      data: {
        projectId: project.id,
        roleId: frontend.id,
        userId: seated.id,
        motivation: 'm'.repeat(50),
        availabilityHoursPerWeek: 5,
        status: 'SELECTED',
      },
    });
    await h.prisma.teamMember.create({
      data: { teamId: team.id, userId: seated.id, roleId: frontend.id, applicationId: app.id, status: 'ACTIVE' },
    });
    const other = await createProject(h.prisma, { difficulty: 'INTERMEDIATE' });
    const full = await applyWith(h, u, project.id, application(frontend.id)).expect(409);
    expect(full.body.error.code).toBe(ErrorCode.ROLE_FILLED);
    expect(full.body.error.details.projects).toEqual(
      expect.arrayContaining([expect.objectContaining({ slug: other.slug, roleTitle: 'Frontend Developer', open: 1 })]),
    );

    // The CV is stored and only its owner (or an admin) can download it.
    const ok = await applyWith(h, u, project.id, application(project.roles[0].id)).expect(201);
    expect(ok.body.cv).toEqual({ fileName: 'my cv.pdf', sizeBytes: expect.any(Number) });
    expect(ok.body.screening).toMatchObject({ status: 'PENDING', passScore: 80 });
    const file = await h.http().get(`/api/v1/applications/${ok.body.id}/cv`).set(bearer(u)).expect(200);
    expect(file.headers['content-type']).toBe('application/pdf');
    await h.http().get(`/api/v1/applications/${ok.body.id}/cv`).set(bearer(seated)).expect(404);
  });
});
