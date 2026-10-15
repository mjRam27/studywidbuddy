import { createPrivateKey, type KeyObject, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import type { Env } from '../common/config/env';

export class GithubApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface GithubRepo {
  id: number;
  owner: string;
  name: string;
  htmlUrl: string;
  defaultBranch: string;
  private: boolean;
}

/**
 * The GitHub operations the platform uses. Domain code depends on this abstract class;
 * tests replace it with a fake, so the suite never calls GitHub.
 */
export abstract class GithubClient {
  abstract createTeam(name: string, description: string): Promise<{ slug: string }>;
  abstract createRepo(name: string, description: string): Promise<GithubRepo>;
  abstract grantTeamRepo(teamSlug: string, repo: string, permission: 'push' | 'pull'): Promise<void>;
  abstract putFile(repo: string, path: string, content: string, message: string): Promise<void>;
  /** Adds (or invites) a user to the org team. Returns 'active' or 'pending' (invitation sent). */
  abstract addTeamMember(teamSlug: string, login: string): Promise<'active' | 'pending'>;
  abstract removeTeamMember(teamSlug: string, login: string): Promise<void>;
  /** OAuth: exchanges the callback code for the user's identity. The user token is not kept. */
  abstract identify(code: string): Promise<{ id: number; login: string }>;
  abstract authorizeUrl(state: string): string;
}

const API = 'https://api.github.com';

/**
 * GitHub App client over plain fetch. App JWTs are signed with the app's private key
 * (RS256); installation tokens are cached until shortly before they expire.
 */
export class HttpGithubClient extends GithubClient {
  private readonly logger = new Logger(HttpGithubClient.name);
  private key: KeyObject | null = null;
  private token: { value: string; expires: number } | null = null;
  private installationId: number | null = null;

  constructor(private readonly env: Env) {
    super();
  }

  private get org() {
    return this.env.GITHUB_ORG!;
  }

  // ───────── auth ─────────

  private privateKey(): KeyObject {
    if (this.key) return this.key;
    const pem = this.env.GITHUB_APP_PRIVATE_KEY
      ? this.env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
      : readFileSync(this.env.GITHUB_APP_PRIVATE_KEY_PATH!, 'utf8');
    this.key = createPrivateKey(pem);
    return this.key;
  }

  private appJwt(): string {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    // iat is back-dated a minute to tolerate clock drift; GitHub allows at most 10 minutes.
    const body = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iat: now - 60, exp: now + 540, iss: this.env.GITHUB_APP_ID })}`;
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), this.privateKey()).toString('base64url')}`;
  }

  private async installationToken(): Promise<string> {
    if (this.token && this.token.expires - Date.now() > 5 * 60_000) return this.token.value;
    if (!this.installationId) {
      const inst = await this.call<{ id: number }>('GET', `/orgs/${this.org}/installation`, undefined, this.appJwt());
      this.installationId = inst.id;
    }
    const t = await this.call<{ token: string; expires_at: string }>(
      'POST',
      `/app/installations/${this.installationId}/access_tokens`,
      undefined,
      this.appJwt(),
    );
    this.token = { value: t.token, expires: new Date(t.expires_at).getTime() };
    return t.token;
  }

  private async call<T>(method: string, path: string, body?: unknown, bearer?: string): Promise<T> {
    const res = await fetch(API + path, {
      method,
      headers: {
        authorization: `Bearer ${bearer ?? (await this.installationToken())}`,
        accept: 'application/vnd.github+json',
        'x-github-api-version': '2022-11-28',
        'user-agent': 'studywidbuddy',
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    if (!res.ok) {
      let msg = text.slice(0, 300);
      try {
        msg = (JSON.parse(text) as { message?: string }).message ?? msg;
      } catch {
        /* keep raw */
      }
      this.logger.warn(`GitHub ${method} ${path} → ${res.status}: ${msg}`);
      throw new GithubApiError(res.status, msg);
    }
    return (text ? JSON.parse(text) : undefined) as T;
  }

  // ───────── operations ─────────

  async createTeam(name: string, description: string) {
    try {
      const t = await this.call<{ slug: string }>('POST', `/orgs/${this.org}/teams`, {
        name,
        description,
        privacy: 'closed',
      });
      return { slug: t.slug };
    } catch (e) {
      // Already exists (e.g. a retried provisioning): reuse it.
      if (e instanceof GithubApiError && e.status === 422) {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
        const t = await this.call<{ slug: string }>('GET', `/orgs/${this.org}/teams/${slug}`);
        return { slug: t.slug };
      }
      throw e;
    }
  }

  async createRepo(name: string, description: string): Promise<GithubRepo> {
    type Raw = {
      id: number;
      name: string;
      html_url: string;
      default_branch: string;
      private: boolean;
      owner: { login: string };
    };
    let r: Raw;
    try {
      r = await this.call<Raw>('POST', `/orgs/${this.org}/repos`, {
        name,
        description,
        private: true,
        auto_init: true,
        has_wiki: false,
        delete_branch_on_merge: true,
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
      });
    } catch (e) {
      // Already exists (a retry after a partial failure): reuse it.
      if (!(e instanceof GithubApiError && e.status === 422)) throw e;
      r = await this.call<Raw>('GET', `/repos/${this.org}/${name}`);
    }
    return {
      id: r.id,
      owner: r.owner.login,
      name: r.name,
      htmlUrl: r.html_url,
      defaultBranch: r.default_branch,
      private: r.private,
    };
  }

  async grantTeamRepo(teamSlug: string, repo: string, permission: 'push' | 'pull') {
    await this.call('PUT', `/orgs/${this.org}/teams/${teamSlug}/repos/${this.org}/${repo}`, { permission });
  }

  async putFile(repo: string, path: string, content: string, message: string) {
    let sha: string | undefined;
    try {
      sha = (await this.call<{ sha: string }>('GET', `/repos/${this.org}/${repo}/contents/${path}`)).sha;
    } catch (e) {
      if (!(e instanceof GithubApiError && e.status === 404)) throw e;
    }
    await this.call('PUT', `/repos/${this.org}/${repo}/contents/${path}`, {
      message,
      content: Buffer.from(content).toString('base64'),
      sha,
    });
  }

  async addTeamMember(teamSlug: string, login: string) {
    const r = await this.call<{ state: 'active' | 'pending' }>(
      'PUT',
      `/orgs/${this.org}/teams/${teamSlug}/memberships/${login}`,
      { role: 'member' },
    );
    return r.state;
  }

  async removeTeamMember(teamSlug: string, login: string) {
    try {
      await this.call('DELETE', `/orgs/${this.org}/teams/${teamSlug}/memberships/${login}`);
    } catch (e) {
      if (!(e instanceof GithubApiError && e.status === 404)) throw e;
    }
  }

  authorizeUrl(state: string) {
    const u = new URL('https://github.com/login/oauth/authorize');
    u.searchParams.set('client_id', this.env.GITHUB_CLIENT_ID!);
    u.searchParams.set('state', state);
    u.searchParams.set('allow_signup', 'true');
    return u.toString();
  }

  async identify(code: string) {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { accept: 'application/json', 'content-type': 'application/json', 'user-agent': 'studywidbuddy' },
      body: JSON.stringify({
        client_id: this.env.GITHUB_CLIENT_ID,
        client_secret: this.env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    const body = (await res.json()) as { access_token?: string; error_description?: string };
    if (!body.access_token) throw new GithubApiError(401, body.error_description ?? 'GitHub sign-in failed');
    const user = await this.call<{ id: number; login: string }>('GET', '/user', undefined, body.access_token);
    return { id: user.id, login: user.login };
  }
}
