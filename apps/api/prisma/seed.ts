/**
 * Loads DEMO data for local development: `npm run db:seed`.
 * Idempotent (upserts by slug/email). Refuses to run when NODE_ENV=production.
 */
import { PrismaClient, SkillSource } from '@prisma/client';
import { hashPassword } from '../src/auth/crypto';
import { LESSON_VIDEOS } from './lesson-videos';
import { courses, deliveryWorkspace, DEMO_EMAIL_DOMAIN, projects, skills, users } from './seed-data';

const prisma = new PrismaClient();
const DAY = 86_400_000;

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to load demo data with NODE_ENV=production.');
  }
  const password = process.env.SEED_DEMO_PASSWORD ?? 'studywidbuddy-demo';

  for (const s of skills) {
    await prisma.skill.upsert({ where: { slug: s.slug }, create: s, update: { name: s.name, category: s.category } });
  }
  const skillId = new Map(
    (await prisma.skill.findMany({ select: { id: true, slug: true } })).map((s) => [s.slug, s.id]),
  );
  const sid = (slug: string) => {
    const id = skillId.get(slug);
    if (!id) throw new Error(`Unknown skill slug in seed data: ${slug}`);
    return id;
  };

  for (const c of courses) {
    const { modules, skills: courseSkills, ...fields } = c;
    const course = await prisma.course.upsert({
      where: { slug: c.slug },
      create: { ...fields, publishedAt: new Date() },
      update: { ...fields },
    });
    await prisma.courseSkill.deleteMany({ where: { courseId: course.id } });
    await prisma.courseSkill.createMany({ data: courseSkills.map((s) => ({ courseId: course.id, skillId: sid(s) })) });
    for (const [mi, m] of modules.entries()) {
      const mod = await prisma.courseModule.upsert({
        where: { courseId_position: { courseId: course.id, position: mi + 1 } },
        create: { courseId: course.id, position: mi + 1, title: m.title },
        update: { title: m.title },
      });
      for (const [li, [title, minutes]] of m.lessons.entries()) {
        await prisma.lesson.upsert({
          where: { moduleId_position: { moduleId: mod.id, position: li + 1 } },
          create: { moduleId: mod.id, position: li + 1, title, durationSec: minutes * 60 },
          update: { title, durationSec: minutes * 60 },
        });
      }
    }
  }

  for (const p of projects) {
    const { roles, tech, deadlineInDays, startsInDays, ...fields } = p;
    const data = {
      ...fields,
      teamSize: roles.reduce((n, r) => n + r.seats, 0),
      applicationDeadline: deadlineInDays === null ? null : new Date(Date.now() + deadlineInDays * DAY),
      startsAt: startsInDays === null ? null : new Date(Date.now() + startsInDays * DAY),
    };
    const project = await prisma.project.upsert({ where: { slug: p.slug }, create: data, update: data });
    await prisma.projectTechnology.deleteMany({ where: { projectId: project.id } });
    await prisma.projectTechnology.createMany({ data: tech.map((t) => ({ projectId: project.id, skillId: sid(t) })) });
    for (const r of roles) {
      const { skills: reqs, ...roleFields } = r;
      const row = await prisma.projectRole.upsert({
        where: { projectId_key: { projectId: project.id, key: r.key } },
        create: { projectId: project.id, ...roleFields },
        update: roleFields,
      });
      await prisma.projectRequiredSkill.deleteMany({ where: { roleId: row.id } });
      await prisma.projectRequiredSkill.createMany({
        data: reqs.map(([slug, minLevel]) => ({ roleId: row.id, skillId: sid(slug), minLevel })),
      });
    }
  }

  const passwordHash = await hashPassword(password);
  for (const u of users) {
    const email = `${u.handle.replace(/\./g, '_')}@${DEMO_EMAIL_DOMAIN}`;
    const profile = {
      displayName: u.name,
      headline: u.headline,
      bio: u.bio ?? null,
      location: u.location ?? null,
      timezone: u.timezone,
      languages: u.languages,
      onboardedAt: new Date(),
    };
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        email,
        passwordHash,
        role: u.admin ? 'ADMIN' : 'USER',
        emailVerifiedAt: new Date(),
        profile: { create: { username: u.handle, ...profile } },
      },
      update: { role: u.admin ? 'ADMIN' : 'USER', profile: { update: profile } },
    });
    for (const [slug, level] of u.skills) {
      await prisma.userSkill.upsert({
        where: { userId_skillId_source: { userId: user.id, skillId: sid(slug), source: SkillSource.CLAIMED } },
        create: { userId: user.id, skillId: sid(slug), source: SkillSource.CLAIMED, level },
        update: { level },
      });
    }
    for (const [slug, level, done] of u.enrollments ?? []) {
      const course = await prisma.course.findUniqueOrThrow({
        where: { slug },
        include: { modules: { orderBy: { position: 'asc' }, include: { lessons: { orderBy: { position: 'asc' } } } } },
      });
      const existing = await prisma.enrollment.findFirst({
        where: { userId: user.id, courseId: course.id, status: 'ACTIVE' },
      });
      const enrollment =
        existing ?? (await prisma.enrollment.create({ data: { userId: user.id, courseId: course.id, level } }));
      const lessons = course.modules.flatMap((m) => m.lessons);
      const toComplete = lessons.slice(0, Math.round(lessons.length * done));
      // Spread demo progress over past days (most recent last) so streaks and activity look lived-in.
      for (const [i, l] of toComplete.entries()) {
        const completedAt = new Date(Date.now() - (toComplete.length - 1 - i) * 1.4 * DAY - 3_600_000);
        await prisma.lessonProgress.upsert({
          where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: l.id } },
          create: { enrollmentId: enrollment.id, lessonId: l.id, completedAt },
          update: { completedAt },
        });
      }
    }
  }

  await seedWorkspace();
  const videos = await seedLessonVideos();

  console.log(`Lesson videos: ${videos.added} added (${videos.kept} lessons already had a video and were kept).`);
  console.log(
    `Seeded ${skills.length} skills, ${courses.length} courses, ${projects.length} projects, ${users.length} demo users.`,
  );
  console.log(`Demo sign-in: manoj_dev@${DEMO_EMAIL_DOMAIN} / ${password}  (admin: admin@${DEMO_EMAIL_DOMAIN})`);
}

/**
 * Attaches the curated YouTube video to each lesson (see lesson-videos.ts). Only lessons
 * without a video are filled, so videos set by an admin are never overwritten.
 */
async function seedLessonVideos() {
  let added = 0;
  let kept = 0;
  for (const [slug, byLabel] of Object.entries(LESSON_VIDEOS)) {
    const course = await prisma.course.findUnique({
      where: { slug },
      include: { modules: { include: { lessons: true } } },
    });
    if (!course) continue;
    for (const m of course.modules) {
      for (const l of m.lessons) {
        const v = byLabel[`${m.position}.${l.position}`];
        if (!v) continue;
        if (l.youtubeId) {
          kept++;
          continue;
        }
        await prisma.lesson.update({
          where: { id: l.id },
          data: { youtubeId: v.youtubeId, videoTitle: v.title, videoChannel: v.channel },
        });
        added++;
      }
    }
  }
  return { added, kept };
}

/** Demo team, sprints and board for the Real-Time Delivery Platform (see seed-data.ts). */
async function seedWorkspace() {
  const w = deliveryWorkspace;
  const project = await prisma.project.findUniqueOrThrow({ where: { slug: w.projectSlug }, include: { roles: true } });
  const role = (key: string) => project.roles.find((r) => r.key === key)!.id;
  const userId = async (handle: string) =>
    (await prisma.profile.findUniqueOrThrow({ where: { username: handle }, select: { userId: true } })).userId;
  const team = await prisma.team.upsert({
    where: { projectId: project.id },
    create: { projectId: project.id },
    update: {},
  });

  for (const [handle, roleKey] of w.team) {
    const uid = await userId(handle);
    const existing = await prisma.teamMember.findUnique({ where: { teamId_userId: { teamId: team.id, userId: uid } } });
    if (existing) continue;
    const app = await prisma.projectApplication.create({
      data: {
        projectId: project.id,
        roleId: role(roleKey),
        userId: uid,
        status: 'SELECTED',
        motivation: 'Demo team member for the seeded workspace.',
        availabilityHoursPerWeek: 10,
        events: { create: [{ toStatus: 'SUBMITTED' }, { fromStatus: 'SUBMITTED', toStatus: 'SELECTED' }] },
      },
    });
    await prisma.teamMember.create({
      data: {
        teamId: team.id,
        userId: uid,
        roleId: role(roleKey),
        applicationId: app.id,
        status: 'ACTIVE',
        respondedAt: new Date(),
      },
    });
  }

  const at = (days: number) => new Date(Date.now() + days * DAY);
  for (const [i, m] of w.milestones.entries()) {
    const data = { title: m.title, dueDate: at(m.dueInDays), completedAt: m.done ? at(m.dueInDays) : null };
    await prisma.milestone.upsert({
      where: { projectId_position: { projectId: project.id, position: i + 1 } },
      create: { projectId: project.id, position: i + 1, ...data },
      update: data,
    });
  }

  const sprintIds = new Map<number, string>();
  for (const s of w.sprints) {
    const data = {
      goal: s.goal,
      startsAt: at(s.startInDays),
      endsAt: at(s.endInDays),
      status: s.status,
      completedAt: s.status === 'COMPLETED' ? at(s.endInDays) : null,
    };
    const row = await prisma.sprint.upsert({
      where: { projectId_number: { projectId: project.id, number: s.number } },
      create: { projectId: project.id, number: s.number, ...data },
      update: data,
    });
    sprintIds.set(s.number, row.id);
  }

  const taskIds = new Map<number, string>();
  let position = 1024;
  for (const [number, title, status, roleKey, handle, priority, estimate, sprint, , extra] of w.tasks) {
    const more = w.descriptions[number];
    const data = {
      title,
      status,
      roleId: role(roleKey),
      assigneeId: await userId(handle),
      priority,
      estimate,
      sprintId: sprintIds.get(sprint)!,
      aiSuggested: !!extra.ai,
      description: more?.description ?? '',
      acceptanceCriteria: more?.acceptance ?? [],
      branch: more?.branch ?? null,
      dueDate: extra.dueInDays === undefined ? null : at(extra.dueInDays),
      completedAt: status === 'DONE' ? at(-(extra.completedDaysAgo ?? 12)) : null,
      startedAt: ['IN_PROGRESS', 'REVIEW', 'DONE'].includes(status) ? at(-5) : null,
      position: (position += 1024),
    };
    const row = await prisma.task.upsert({
      where: { projectId_number: { projectId: project.id, number } },
      create: { projectId: project.id, number, ...data },
      update: data,
    });
    taskIds.set(number, row.id);
  }
  for (const t of w.tasks) {
    for (const d of t[8]) {
      const key = { taskId: taskIds.get(t[0])!, dependsOnId: taskIds.get(d)! };
      await prisma.taskDependency.upsert({ where: { taskId_dependsOnId: key }, create: key, update: {} });
    }
  }

  if (!(await prisma.projectActivity.count({ where: { projectId: project.id } }))) {
    const manoj = await userId('manoj.dev');
    await prisma.projectActivity.createMany({
      data: [
        {
          projectId: project.id,
          type: 'SPRINT_STARTED',
          actorUserId: manoj,
          summary: 'started Sprint 2',
          createdAt: at(-10),
        },
        {
          projectId: project.id,
          type: 'TASK_STATUS_CHANGED',
          actorUserId: await userId('sarah.chen'),
          taskId: taskIds.get(28),
          summary: 'moved TASK-28 from in review to done',
          createdAt: at(-3),
        },
        {
          projectId: project.id,
          type: 'TASK_STATUS_CHANGED',
          actorUserId: manoj,
          taskId: taskIds.get(22),
          summary: 'moved TASK-22 from in progress to in review',
          createdAt: at(-1),
        },
      ],
    });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
