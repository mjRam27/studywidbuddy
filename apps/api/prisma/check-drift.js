// Fails (exit 2) when prisma/schema.prisma and the migrations folder disagree.
// Usage: npm run db:check   (needs SHADOW_DATABASE_URL, read from the environment or apps/api/.env)
const { execFileSync } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const envFile = join(__dirname, '..', '.env');
if (!process.env.SHADOW_DATABASE_URL && existsSync(envFile)) {
  const line = readFileSync(envFile, 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('SHADOW_DATABASE_URL='));
  if (line) process.env.SHADOW_DATABASE_URL = line.slice('SHADOW_DATABASE_URL='.length);
}
if (!process.env.SHADOW_DATABASE_URL) {
  console.error('SHADOW_DATABASE_URL is not set.');
  process.exit(1);
}

try {
  execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    [
      'prisma',
      'migrate',
      'diff',
      '--from-migrations',
      join(__dirname, 'migrations'),
      '--to-schema-datamodel',
      join(__dirname, 'schema.prisma'),
      '--shadow-database-url',
      process.env.SHADOW_DATABASE_URL,
      '--exit-code',
    ],
    { stdio: 'inherit', shell: process.platform === 'win32' },
  );
  console.log('Schema and migrations are in sync.');
} catch (e) {
  console.error('Schema drift: create a migration for the changes above.');
  process.exit(e.status ?? 1);
}
