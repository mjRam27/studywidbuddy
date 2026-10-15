import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient, SkillLevel } from '@prisma/client';
import { CSRF_HEADER } from '@studywidbuddy/shared';
import type { AuthResponse } from '@studywidbuddy/shared';
import request from 'supertest';
import { AiProvider } from '../src/ai/ai-provider';
import { AppModule } from '../src/app.module';
import { Mailer, MailMessage } from '../src/mail/mailer';
import { setupApp } from '../src/setup-app';

/** Collects outgoing email so tests can follow verification and reset links. */
export class CapturingMailer extends Mailer {
  readonly sent: MailMessage[] = [];

  async send(m: MailMessage) {
    this.sent.push(m);
  }

  tokenFor(to: string, path: string): string {
    const mail = [...this.sent].reverse().find((m) => m.to === to && m.text.includes(path));
    const match = mail && new RegExp(`${path}\\?token=([A-Za-z0-9_-]+)`).exec(mail.text);
    if (!match) throw new Error(`No ${path} email for ${to}`);
    return match[1];
  }
}

export interface Harness {
  app: INestApplication;
  http: () => ReturnType<typeof request>;
  prisma: PrismaClient;
  mailer: CapturingMailer;
  close: () => Promise<void>;
}

export async function createHarness(
  opts: { ai?: AiProvider; overrides?: [token: unknown, value: unknown][] } = {},
): Promise<Harness> {
  const mailer = new CapturingMailer();
  let builder = Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Mailer)
    .useValue(mailer);
  if (opts.ai) builder = builder.overrideProvider(AiProvider).useValue(opts.ai);
  for (const [token, value] of opts.overrides ?? []) builder = builder.overrideProvider(token).useValue(value);
  const moduleRef = await builder.compile();
  const app = setupApp(moduleRef.createNestApplication({ logger: ['error'], rawBody: true }));
  await app.init();
  const prisma = new PrismaClient();
  return {
    app,
    http: () => request(app.getHttpServer()),
    prisma,
    mailer,
    close: async () => {
      await prisma.$disconnect();
      await app.close();
    },
  };
}

/** Empties every table except Prisma's migration log. */
export async function resetDatabase(prisma: PrismaClient) {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length) {
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  }
}

let counter = 0;
export const uniq = (prefix: string) => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`;

export interface TestUser {
  id: string;
  email: string;
  password: string;
  token: string;
  cookie: string;
}

/** Registers through the real API (so auth is exercised too) and optionally verifies the email. */
export async function registerUser(h: Harness, opts: { verified?: boolean } = {}): Promise<TestUser> {
  const handle = uniq('u');
  const email = `${handle}@example.test`;
  const password = 'correct horse battery staple';
  const res = await h
    .http()
    .post('/api/v1/auth/register')
    .send({ email, password, displayName: `User ${handle}`, username: handle })
    .expect(201);
  const body = res.body as AuthResponse;
  if (opts.verified) {
    await h.prisma.user.update({ where: { id: body.user.id }, data: { emailVerifiedAt: new Date() } });
  }
  return { id: body.user.id, email, password, token: body.accessToken, cookie: refreshCookie(res) };
}

export function refreshCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((v) => v.startsWith('sb_refresh='));
  if (!c) throw new Error('No refresh cookie in response');
  return c.split(';')[0];
}

export const csrf = { [CSRF_HEADER]: '1' };
export const bearer = (u: { token: string }) => ({ Authorization: `Bearer ${u.token}` });

/** Minimal catalogue fixtures: N published courses with two lessons each. */
export async function createCourses(prisma: PrismaClient, n: number) {
  const ids: { courseId: string; lessonIds: string[] }[] = [];
  for (let i = 0; i < n; i++) {
    const course = await prisma.course.create({
      data: {
        slug: uniq('course-'),
        title: `Course ${i + 1}`,
        summary: 'Summary',
        description: 'Description',
        category: 'TEST',
        level: SkillLevel.BEGINNER,
        estimatedHours: 5,
        publishedAt: new Date(),
        modules: {
          create: [
            {
              position: 1,
              title: 'M1',
              lessons: {
                create: [
                  { position: 1, title: 'L1', durationSec: 60 },
                  { position: 2, title: 'L2', durationSec: 60 },
                ],
              },
            },
          ],
        },
      },
      include: { modules: { include: { lessons: { orderBy: { position: 'asc' } } } } },
    });
    ids.push({ courseId: course.id, lessonIds: course.modules[0].lessons.map((l) => l.id) });
  }
  return ids;
}

export async function createProject(
  prisma: PrismaClient,
  opts: {
    status?: 'OPEN' | 'DRAFT' | 'IN_PROGRESS';
    deadline?: Date | null;
    difficulty?: SkillLevel;
  } = {},
) {
  return prisma.project.create({
    data: {
      slug: uniq('project-'),
      title: 'Test Project',
      summary: 'Summary',
      description: 'Description',
      problem: 'Problem',
      difficulty: opts.difficulty ?? SkillLevel.BEGINNER,
      status: opts.status ?? 'OPEN',
      durationWeeks: 4,
      teamSize: 3,
      applicationDeadline: opts.deadline ?? null,
      roles: {
        create: [
          { key: 'backend', title: 'Backend Developer', description: 'APIs', seats: 2 },
          { key: 'frontend', title: 'Frontend Developer', description: 'UI', seats: 1 },
        ],
      },
    },
    include: { roles: true },
  });
}

/** Polls until `check` returns a truthy value (e.g. waiting for a background job). */
export async function waitFor<T>(check: () => Promise<T | false | null | undefined>, timeoutMs = 15_000): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > deadline) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 150));
  }
}

/** The smallest file that passes the CV check (starts with %PDF-). The scripted AI never reads it. */
export const TINY_PDF = Buffer.from(['%PDF-1.4', '1 0 obj<<>>endobj', 'trailer<<>>', '%%EOF', ''].join('\n'));

/** Applies through the real multipart endpoint, with a CV unless `cv` is null. */
export function applyWith(
  h: Harness,
  u: { token: string },
  projectId: string,
  body: Record<string, unknown>,
  cv: Buffer | null = TINY_PDF,
) {
  let r = h.http().post(`/api/v1/projects/${projectId}/applications`).set(bearer(u));
  for (const [k, v] of Object.entries(body)) if (v !== undefined && v !== null) r = r.field(k, String(v));
  if (cv) r = r.attach('cv', cv, { filename: 'my cv.pdf', contentType: 'application/pdf' });
  return r;
}
