import {
  GithubApiError,
  GithubClient,
  type GithubPrFile,
  type GithubPullRequest,
  type GithubRepo,
  type GithubReviewComment,
} from '../../src/github/github-client';

/** TEST ONLY. Records every GitHub operation instead of calling GitHub. */
export class FakeGithubClient extends GithubClient {
  readonly teams = new Map<string, Set<string>>();
  readonly repos = new Map<string, GithubRepo>();
  readonly files = new Map<string, string>();
  readonly grants: string[] = [];
  /** OAuth codes the fake GitHub accepts. */
  readonly codes = new Map<string, { id: number; login: string }>();
  private nextId = 1000;
  /** Pull requests on the fake GitHub, keyed "repo#number". */
  readonly pulls = new Map<string, { pr: GithubPullRequest; files: GithubPrFile[] }>();
  readonly reviews: { repo: string; number: number; commitId: string; body: string; comments: GithubReviewComment[] }[] =
    [];
  /** When set, the next createReview with inline comments fails like GitHub's 422 for a bad line. */
  rejectInlineOnce = false;

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
  async pullRequest(repo: string, number: number) {
    const p = this.pulls.get(`${repo}#${number}`);
    if (!p) throw new GithubApiError(404, 'Not Found');
    return p.pr;
  }
  async pullRequestFiles(repo: string, number: number) {
    return this.pulls.get(`${repo}#${number}`)?.files ?? [];
  }
  async createReview(
    repo: string,
    number: number,
    review: { commitId: string; body: string; comments: GithubReviewComment[] },
  ) {
    if (this.rejectInlineOnce && review.comments.length) {
      this.rejectInlineOnce = false;
      throw new GithubApiError(422, 'Line could not be resolved');
    }
    this.reviews.push({ repo, number, ...review });
    const id = this.nextId++;
    return { id, htmlUrl: `https://github.com/sb-test-org/${repo}/pull/${number}#pullrequestreview-${id}` };
  }
  authorizeUrl(state: string) {
    return `https://github.com/login/oauth/authorize?client_id=Iv1.test&state=${state}`;
  }
}
