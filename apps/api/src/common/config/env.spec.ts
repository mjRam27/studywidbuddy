import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  JWT_ACCESS_SECRET: 'x'.repeat(40),
};

describe('validateEnv', () => {
  it('applies defaults and splits origins', () => {
    const env = validateEnv({ ...base, WEB_ORIGIN: 'http://a.test, http://b.test' });
    expect(env.PORT).toBe(3000);
    expect(env.WEB_ORIGIN).toEqual(['http://a.test', 'http://b.test']);
    expect(env.SMTP_URL).toBeUndefined();
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('requires a database url', () => {
    expect(() => validateEnv({ JWT_ACCESS_SECRET: base.JWT_ACCESS_SECRET })).toThrow(/DATABASE_URL/);
  });

  it('accepts GitHub fully configured or not at all, never half', () => {
    expect(validateEnv(base).GITHUB_APP_ID).toBeUndefined();
    const full = {
      ...base,
      GITHUB_ORG: 'org',
      GITHUB_APP_ID: '1',
      GITHUB_CLIENT_ID: 'Iv1.x',
      GITHUB_CLIENT_SECRET: 's',
      GITHUB_APP_PRIVATE_KEY_PATH: '/k.pem',
      GITHUB_WEBHOOK_SECRET: 'w',
    };
    expect(validateEnv(full).GITHUB_ORG).toBe('org');
    expect(() => validateEnv({ ...full, GITHUB_WEBHOOK_SECRET: '' })).toThrow(/GITHUB_WEBHOOK_SECRET/);
  });
});
