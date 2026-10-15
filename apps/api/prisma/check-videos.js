/**
 * `npm run videos:check` — asks YouTube (oEmbed) whether every lesson video still exists and
 * may be embedded. YouTube videos get deleted or made private over time; run this now and
 * then and replace broken ones from the admin "Lesson videos" page.
 */
const { existsSync } = require('node:fs');
if (existsSync('.env')) process.loadEnvFile('.env');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function check(id) {
  const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) return 'ok';
    if (res.status === 401 || res.status === 403) return 'embedding disabled';
    if (res.status === 400 || res.status === 404) return 'deleted or private';
    return `HTTP ${res.status}`;
  } catch (e) {
    return `unreachable (${e.message})`;
  }
}

(async () => {
  const lessons = await prisma.lesson.findMany({
    where: { youtubeId: { not: null } },
    select: {
      youtubeId: true,
      position: true,
      title: true,
      module: { select: { position: true, course: { select: { slug: true } } } },
    },
  });
  let broken = 0;
  for (const l of lessons) {
    const r = await check(l.youtubeId);
    if (r !== 'ok') {
      broken++;
      console.log(`✗ ${l.module.course.slug} ${l.module.position}.${l.position} "${l.title}" (${l.youtubeId}): ${r}`);
    }
    await new Promise((x) => setTimeout(x, 100));
  }
  console.log(`${lessons.length - broken}/${lessons.length} lesson videos OK.`);
  await prisma.$disconnect();
  process.exitCode = broken ? 1 : 0;
})();
