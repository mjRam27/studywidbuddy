import { execSync } from 'node:child_process';
import { join } from 'node:path';

/** Applies migrations to the test database once per e2e run. */
export default async function globalSetup() {
  // Reuse the per-file env loader to resolve TEST_DATABASE_URL from .env.
  require('./env');
  execSync('npx prisma migrate deploy', {
    cwd: join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, DIRECT_URL: process.env.TEST_DATABASE_URL },
    stdio: 'pipe',
  });
}
