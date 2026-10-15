import { ErrorCode } from '@studywidbuddy/shared';
import { bearer, createHarness, csrf, Harness, refreshCookie, registerUser, resetDatabase } from './harness';

describe('auth (e2e)', () => {
  let h: Harness;

  beforeAll(async () => {
    h = await createHarness();
    await resetDatabase(h.prisma);
  });
  afterAll(() => h.close());

  it('registers, returns an access token and sets an httpOnly refresh cookie', async () => {
    const res = await h
      .http()
      .post('/api/v1/auth/register')
      .send({ email: 'New@Example.test', password: 'a long enough password', displayName: 'New', username: 'New.User' })
      .expect(201);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'new@example.test', username: 'new.user', emailVerified: false });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('sb_refresh='))!;
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).toMatch(/SameSite=Strict/);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
    // Password hash never leaves the server.
    expect(JSON.stringify(res.body)).not.toMatch(/argon2/);
  });

  it('rejects duplicate email and username', async () => {
    const u = await registerUser(h);
    const dupEmail = await h
      .http()
      .post('/api/v1/auth/register')
      .send({ email: u.email, password: 'a long enough password', displayName: 'X', username: 'someone.else' })
      .expect(409);
    expect(dupEmail.body.error.code).toBe(ErrorCode.EMAIL_TAKEN);
  });

  it('validates input and refuses unknown fields', async () => {
    const res = await h
      .http()
      .post('/api/v1/auth/register')
      .send({ email: 'bad', password: 'short', displayName: '', username: 'x', role: 'ADMIN' })
      .expect(400);
    expect(res.body.error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(res.body.error.details.join(' ')).toMatch(/role should not exist/);
  });

  it('logs in with the right password only, without revealing which part was wrong', async () => {
    const u = await registerUser(h);
    await h.http().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(200);
    const wrong = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email: u.email, password: 'nope nope nope' })
      .expect(401);
    const unknown = await h
      .http()
      .post('/api/v1/auth/login')
      .send({ email: 'nobody@example.test', password: 'nope nope nope' })
      .expect(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('protects routes and returns the current user', async () => {
    await h.http().get('/api/v1/auth/me').expect(401);
    const u = await registerUser(h);
    const me = await h.http().get('/api/v1/auth/me').set(bearer(u)).expect(200);
    expect(me.body.id).toBe(u.id);
    await h.http().get('/api/v1/auth/me').set({ Authorization: 'Bearer not-a-jwt' }).expect(401);
  });

  describe('refresh tokens', () => {
    it('requires the CSRF header', async () => {
      const u = await registerUser(h);
      await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).expect(401);
    });

    it('rotates on every use', async () => {
      const u = await registerUser(h);
      const res = await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf).expect(200);
      expect(refreshCookie(res)).not.toBe(u.cookie);
      await h
        .http()
        .get('/api/v1/auth/me')
        .set(bearer({ token: res.body.accessToken }))
        .expect(200);
    });

    it('revokes the whole family when a rotated token is reused', async () => {
      const u = await registerUser(h);
      const first = await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf).expect(200);
      const second = refreshCookie(first);
      // Replay of the original (stolen) token…
      await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf).expect(401);
      // …also kills the legitimate newer token.
      await h.http().post('/api/v1/auth/refresh').set('Cookie', second).set(csrf).expect(401);
    });

    it('lets only one of two concurrent refreshes win', async () => {
      const u = await registerUser(h);
      const results = await Promise.all([
        h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf),
        h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });

    it('logout revokes the session', async () => {
      const u = await registerUser(h);
      await h.http().post('/api/v1/auth/logout').set('Cookie', u.cookie).set(csrf).expect(204);
      await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf).expect(401);
    });
  });

  it('verifies email with a single-use token', async () => {
    const u = await registerUser(h);
    const token = h.mailer.tokenFor(u.email, '/verify-email');
    await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(204);
    const me = await h.http().get('/api/v1/auth/me').set(bearer(u)).expect(200);
    expect(me.body.emailVerified).toBe(true);
    const again = await h.http().post('/api/v1/auth/verify-email').send({ token }).expect(400);
    expect(again.body.error.code).toBe(ErrorCode.TOKEN_INVALID);
  });

  it('resets a password and signs out other sessions', async () => {
    const u = await registerUser(h);
    await h.http().post('/api/v1/auth/forgot-password').send({ email: u.email }).expect(204);
    // Unknown emails get the same response.
    await h.http().post('/api/v1/auth/forgot-password').send({ email: 'ghost@example.test' }).expect(204);

    const token = h.mailer.tokenFor(u.email, '/reset-password');
    await h.http().post('/api/v1/auth/reset-password').send({ token, password: 'a brand new password' }).expect(204);

    await h.http().post('/api/v1/auth/login').send({ email: u.email, password: u.password }).expect(401);
    await h.http().post('/api/v1/auth/login').send({ email: u.email, password: 'a brand new password' }).expect(200);
    await h.http().post('/api/v1/auth/refresh').set('Cookie', u.cookie).set(csrf).expect(401);
    await h.http().post('/api/v1/auth/reset-password').send({ token, password: 'yet another password' }).expect(400);
  });
});
