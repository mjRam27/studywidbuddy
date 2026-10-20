/**
 * Runs before each e2e test file. Points Prisma at the dedicated test database so the
 * suite can truncate tables freely without touching development data.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

function loadDotEnv() {
  const file = join(__dirname, '..', '.env');
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"(.*)"$/, '$1');
  }
}

if (!process.env.SB_E2E_ENV_LOADED) {
  loadDotEnv();
  const testUrl = process.env.TEST_DATABASE_URL;
  if (!testUrl) throw new Error('TEST_DATABASE_URL must be set for e2e tests (see apps/api/.env.example).');
  if (testUrl === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL must point at a different database than DATABASE_URL; the e2e suite truncates it.',
    );
  }
  process.env.DATABASE_URL = testUrl;
  // Migrations use DIRECT_URL; it must follow, or test migrations would hit the real database.
  process.env.DIRECT_URL = testUrl;
  process.env.SB_E2E_ENV_LOADED = '1';
}
process.env.NODE_ENV = 'test';
process.env.SMTP_URL = '';
// Separate queue namespace so a running dev API never picks up test jobs (and vice versa).
process.env.QUEUE_PREFIX = 'sb-test';
process.env.AI_PROVIDER = 'none';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-test-secret-test-secret-123456';
// GitHub: fake app settings. The GitHub client is replaced by a fake in tests; nothing calls GitHub.
Object.assign(process.env, {
  GITHUB_ORG: 'sb-test-org',
  GITHUB_APP_ID: '1',
  GITHUB_CLIENT_ID: 'Iv1.test',
  GITHUB_CLIENT_SECRET: 'test-client-secret',
  GITHUB_APP_PRIVATE_KEY: 'test-key',
  GITHUB_APP_PRIVATE_KEY_PATH: '',
  GITHUB_WEBHOOK_SECRET: 'test-webhook-secret',
  GITHUB_WEBHOOK_PROXY_URL: '',
});
process.env.GEMINI_API_KEY = '';
