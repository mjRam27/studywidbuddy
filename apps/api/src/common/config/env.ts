import { z } from 'zod';

const optional = z
  .string()
  .optional()
  .transform((v) => (v?.trim() ? v.trim() : undefined));

/** Every environment variable the API reads, validated once at boot. */
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:4200')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().default('redis://localhost:6380'),
  /** Namespaces BullMQ keys so test runs never pick up development jobs. */
  QUEUE_PREFIX: z.string().default('sb'),
  /** 'none' disables AI features (they report AI_NOT_CONFIGURED instead of faking output). */
  AI_PROVIDER: z.enum(['none', 'anthropic']).default('none'),
  ANTHROPIC_API_KEY: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  AI_MODEL: z.string().default('claude-opus-5-5'),
  /** Optional: Google Gemini key, used only to transcribe lesson videos (YouTube URL input). */
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default('gemini-3.8-flash'),
  /** Cheaper model for tutoring chat, summaries and quiz questions. */
  AI_MODEL_FAST: z.string().default('claude-haiku-5-5'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_SEC: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  SMTP_URL: z
    .string()
    .optional()
    .transform((v) => (v ? v : undefined)),
  MAIL_FROM: z.string().default('StudywidBuddy <no-reply@studywidbuddy.local>'),

  // GitHub App (team repos, PR ↔ task linking, CI status). All empty = GitHub features off.
  GITHUB_ORG: optional,
  GITHUB_APP_ID: optional,
  GITHUB_CLIENT_ID: optional,
  GITHUB_CLIENT_SECRET: optional,
  /** Path to the app's .pem key (local dev) … */
  GITHUB_APP_PRIVATE_KEY_PATH: optional,
  /** … or the PEM itself (hosting: from a secret store). */
  GITHUB_APP_PRIVATE_KEY: optional,
  GITHUB_WEBHOOK_SECRET: optional,
  /** Development only: smee.io channel that relays GitHub webhooks to this machine. */
  GITHUB_WEBHOOK_PROXY_URL: optional,
  /** Where GitHub's OAuth callback lands; used to send people back to the web app afterwards. */
  API_PUBLIC_URL: z.string().url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof EnvSchema>;

/** Cross-field checks that zod object schemas can't express inline. */
function assertConsistent(env: Env) {
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY) {
    throw new Error('AI_PROVIDER=anthropic needs ANTHROPIC_API_KEY. Set it, or set AI_PROVIDER=none.');
  }
  const gh = {
    GITHUB_ORG: env.GITHUB_ORG,
    GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: env.GITHUB_CLIENT_SECRET,
    'GITHUB_APP_PRIVATE_KEY(_PATH)': env.GITHUB_APP_PRIVATE_KEY ?? env.GITHUB_APP_PRIVATE_KEY_PATH,
    GITHUB_WEBHOOK_SECRET: env.GITHUB_WEBHOOK_SECRET,
  };
  const set = Object.entries(gh).filter(([, v]) => v);
  if (set.length && set.length !== Object.keys(gh).length) {
    const missing = Object.entries(gh)
      .filter(([, v]) => !v)
      .map(([k]) => k);
    throw new Error(`GitHub is partly configured. Also set: ${missing.join(', ')} (or clear all GITHUB_ settings).`);
  }
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  assertConsistent(parsed.data);
  return parsed.data;
}

export const ENV = Symbol('ENV');

/** GitHub features are on only when the app is fully configured. */
export const githubConfigured = (env: Env) => !!(env.GITHUB_APP_ID && env.GITHUB_WEBHOOK_SECRET);
