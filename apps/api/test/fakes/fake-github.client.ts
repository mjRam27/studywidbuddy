import { GithubApiError, GithubClient, type GithubRepo } from '../../src/github/github-client';

/** TEST ONLY. Records every GitHub operation instead of calling GitHub. */
export class FakeGithubClient extends GithubClient {
  readonly teams = new Map<string, Set<string>>();
  readonly repos = new Map<string, GithubRepo>();
  readonly files = new Map<string, string>();
  readonly grants: string[] = [];
  /** OAuth codes the fake GitHub accepts. */
  readonly codes = new Map<string, { id: number; login: string }>();
  private nextId = 1000;

  async createTeam(name: string) {
    const slug = name.toLowerCase();
    if (!this.teams.has(slug)) this.teams.set(slug, new Set());
    return { slug };
  }
  async createRepo(name: string) {
    const repo: GithubRepo = {
      id: this.nextId++,
      owner: 'sb-test-org',
      name,
      htmlUrl: `https://github.com/sb-test-org/${name}`,
      defaultBranch: 'main',
      private: true,
    };
    this.repos.set(name, repo);
    return repo;
  }
  async grantTeamRepo(teamSlug: string, repo: string, permission: string) {
    this.grants.push(`${teamSlug}:${repo}:${permission}`);
  }
  async putFile(repo: string, path: string, content: string) {
    this.files.set(`${repo}/${path}`, content);
  }
  async addTeamMember(teamSlug: string, login: string) {
    this.teams.get(teamSlug)?.add(login);
    return 'active' as const;
  }
  async removeTeamMember(teamSlug: string, login: string) {
    this.teams.get(teamSlug)?.delete(login);
  }
  async identify(code: string) {
    const who = this.codes.get(code);
    if (!who) throw new GithubApiError(401, 'bad code');
    return who;
  }
  authorizeUrl(state: string) {
    return `https://github.com/login/oauth/authorize?client_id=Iv1.test&state=${state}`;
  }
}
