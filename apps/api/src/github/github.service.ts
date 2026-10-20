import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma, TeamMemberStatus } from '@prisma/client';
import { ErrorCode } from '@studywidbuddy/shared';
import type { GithubStatus, ProjectRepoView, PullRequestView } from '@studywidbuddy/shared';
import { ActivityService } from '../activity/activity.service';
import { ChatService } from '../chat/chat.service';
import type { AuthUser } from '../common/auth/auth-user';
import { ENV, type Env, githubConfigured } from '../common/config/env';
import { DomainError, forbidden } from '../common/errors/domain-error';
import { personSelect, toPerson } from '../common/people';
import { PrismaService } from '../common/prisma/prisma.service';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import { taskKey } from '../tasks/tasks.service';
import { WorkspaceAccess } from '../tasks/workspace-access.service';
import { GithubApiError, GithubClient } from './github-client';
import { CI_WORKFLOW, GITIGNORE, PR_TEMPLATE, readme } from './repo-template';

export const GITHUB_UPDATED = 'github:updated';
const LINK_STATE_TTL = '10m';

/** GitHub repo names: letters, digits, '.', '-', '_' (max 100). */
export const repoName = (slug: string) =>
  slug
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || 'project';

/**
 * GitHub accounts, team repositories and access. Every write to GitHub goes through
 * GithubClient (the real one, or a fake in tests).
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly client: GithubClient,
    private readonly jwt: JwtService,
    private readonly access: WorkspaceAccess,
    private readonly activity: ActivityService,
    private readonly chat: ChatService,
    private readonly realtime: RealtimeGateway,
    @Inject(ENV) private readonly env: Env,
  ) {}

  get configured() {
    return githubConfigured(this.env);
  }

  private assertConfigured() {
    if (!this.configured) {
      throw new DomainError(
        ErrorCode.GITHUB_NOT_CONFIGURED,
        'GitHub isn’t connected on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ───────── accounts ─────────

  async status(user: AuthUser): Promise<GithubStatus> {
    const a = await this.prisma.githubAccount.findUnique({ where: { userId: user.id } });
    return {
      configured: this.configured,
      org: this.configured ? (this.env.GITHUB_ORG ?? null) : null,
      account: a ? { login: a.login, linkedAt: a.linkedAt.toISOString() } : null,
    };
  }

  /** A GitHub authorize URL with a short-lived signed state that names the user. */
  async connectUrl(user: AuthUser): Promise<string> {
    this.assertConfigured();
    const state = await this.jwt.signAsync(
      { sub: user.id, typ: 'gh-link' },
      { secret: this.env.JWT_ACCESS_SECRET, expiresIn: LINK_STATE_TTL, algorithm: 'HS256' },
    );
    return this.client.authorizeUrl(state);
  }

  /** OAuth callback. Returns where to send the browser (the web settings page). */
  async completeLink(code: string | undefined, state: string | undefined): Promise<string> {
    const back = (result: string) => `${this.env.WEB_ORIGIN[0]}/settings?github=${result}`;
    if (!code || !state || !this.configured) return back('error');
    let userId: string;
    try {
      const claims = await this.jwt.verifyAsync<{ sub: string; typ: string }>(state, {
        secret: this.env.JWT_ACCESS_SECRET,
        algorithms: ['HS256'],
      });
      if (claims.typ !== 'gh-link') throw new Error('wrong state');
      userId = claims.sub;
    } catch {
      return back('expired');
    }
    let gh: { id: number; login: string };
    try {
      gh = await this.client.identify(code);
    } catch (e) {
      this.logger.warn(`GitHub link failed: ${(e as Error).message}`);
      return back('error');
    }
    const taken = await this.prisma.githubAccount.findUnique({ where: { githubId: BigInt(gh.id) } });
    if (taken && taken.userId !== userId) return back('taken');
    await this.prisma.githubAccount.upsert({
      where: { userId },
      create: { userId, githubId: BigInt(gh.id), login: gh.login },
      update: { githubId: BigInt(gh.id), login: gh.login, linkedAt: new Date() },
    });
    // Give the newly linked account access to the repos of their current teams.
    const repos = await this.prisma.projectRepo.findMany({
      where: { project: { team: { members: { some: { userId, status: TeamMemberStatus.ACTIVE } } } } },
      select: { projectId: true },
    });
    for (const r of repos) await this.syncMembers(r.projectId).catch(() => undefined);
    return back('linked');
  }

  async unlink(user: AuthUser) {
    await this.prisma.githubAccount.deleteMany({ where: { userId: user.id } });
  }

  // ───────── team repositories ─────────

  async view(user: AuthUser, slug: string): Promise<ProjectRepoView> {
    const ctx = await this.access.bySlug(user, slug);
    const [repo, members, prs] = await Promise.all([
      this.prisma.projectRepo.findUnique({ where: { projectId: ctx.projectId } }),
      this.activeMembers(ctx.projectId),
      this.prisma.pullRequest.findMany({
        where: { projectId: ctx.projectId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        include: { task: { select: { id: true, number: true, title: true } } },
      }),
    ]);
    const people = await this.peopleByLogin(prs.map((p) => p.authorLogin));
    return {
      configured: this.configured,
      canCreate: ctx.isAdmin && this.configured && !repo,
      repo: repo
        ? {
            owner: repo.owner,
            name: repo.name,
            fullName: `${repo.owner}/${repo.name}`,
            htmlUrl: repo.htmlUrl,
            cloneUrl: `${repo.htmlUrl}.git`,
            defaultBranch: repo.defaultBranch,
            private: repo.private,
            createdAt: repo.createdAt.toISOString(),
          }
        : null,
      members: members.map((m) => ({
        user: toPerson(m.user),
        githubLogin: m.user.githubAccount?.login ?? null,
        access: m.user.githubAccount ? 'GRANTED' : 'NOT_LINKED',
      })),
      pullRequests: prs.map((p): PullRequestView => ({
        number: p.number,
        title: p.title,
        state: p.state,
        draft: p.draft,
        author: { login: p.authorLogin, user: people.get(p.authorLogin.toLowerCase()) ?? null },
        headBranch: p.headBranch,
        htmlUrl: p.htmlUrl,
        task: p.task ? { id: p.task.id, key: taskKey(p.task.number), title: p.task.title } : null,
        checks: p.checks,
        aiReview: null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
        mergedAt: p.mergedAt?.toISOString() ?? null,
      })),
    };
  }

  /**
   * Admin: creates the team's private repo in the org, a GitHub team with write access,
   * the starter files (README with conventions, CI, PR template), and adds linked members.
   */
  async createRepo(user: AuthUser, slug: string): Promise<ProjectRepoView> {
    this.assertConfigured();
    const ctx = await this.access.bySlug(user, slug);
    if (!ctx.isAdmin) throw forbidden('Only an admin can create the team repository.');
    const project = await this.prisma.project.findUniqueOrThrow({
      where: { id: ctx.projectId },
      include: {
        repo: true,
        team: { select: { id: true } },
        roles: { select: { title: true } },
        techStack: { include: { skill: { select: { name: true } } } },
      },
    });
    if (project.repo) {
      throw new DomainError(ErrorCode.REPO_EXISTS, 'This project already has a repository.', HttpStatus.CONFLICT);
    }
    if (!project.team) {
      throw new DomainError(ErrorCode.CONFLICT, 'Form the team before creating its repository.', HttpStatus.CONFLICT);
    }
    const name = repoName(project.slug);
    try {
      const team = await this.client.createTeam(`${name}-team`, `StudywidBuddy team for ${project.title}`);
      const repo = await this.client.createRepo(name, project.summary.slice(0, 300));
      await this.client.grantTeamRepo(team.slug, repo.name, 'push');
      const ctxT = {
        title: project.title,
        summary: project.summary,
        problem: project.problem,
        slug: project.slug,
        roles: project.roles,
        stack: project.techStack.map((t) => t.skill.name),
        webUrl: this.env.WEB_ORIGIN[0],
      };
      await this.client.putFile(repo.name, 'README.md', readme(ctxT), 'Project README and team conventions');
      await this.client.putFile(repo.name, '.gitignore', GITIGNORE, 'Add .gitignore');
      await this.client.putFile(repo.name, '.github/workflows/ci.yml', CI_WORKFLOW, 'Add CI workflow');
      await this.client.putFile(repo.name, '.github/pull_request_template.md', PR_TEMPLATE, 'Add PR template');
      await this.prisma.projectRepo.create({
        data: {
          projectId: project.id,
          githubRepoId: BigInt(repo.id),
          owner: repo.owner,
          name: repo.name,
          htmlUrl: repo.htmlUrl,
          defaultBranch: repo.defaultBranch,
          private: repo.private,
          teamSlug: team.slug,
          createdById: user.id,
        },
      });
    } catch (e) {
      throw this.githubError(e, 'Creating the repository on GitHub failed');
    }
    await this.activity.record({
      projectId: project.id,
      type: 'REPO_CREATED',
      actorUserId: user.id,
      summary: `created the team repository ${this.env.GITHUB_ORG}/${name}`,
    });
    await this.chat.postAsAi(
      project.id,
      `The team repository is ready: ${this.env.GITHUB_ORG}/${name}. Connect your GitHub account in Settings to get write access, then branch per task (task-24-short-name) and title PRs "TASK-24: …" so they link to the board.`,
      undefined,
      'SYSTEM',
    );
    await this.syncMembers(project.id);
    return this.view(user, slug);
  }

  /** Puts every active, linked member on the repo's GitHub team. Safe to repeat. */
  async syncMembers(projectId: string): Promise<{ added: number; pending: number }> {
    const repo = await this.prisma.projectRepo.findUnique({ where: { projectId } });
    if (!repo || !this.configured) return { added: 0, pending: 0 };
    let added = 0;
    let pending = 0;
    for (const m of await this.activeMembers(projectId)) {
      const login = m.user.githubAccount?.login;
      if (!login) continue;
      try {
        const state = await this.client.addTeamMember(repo.teamSlug, login);
        if (state === 'pending') pending++;
        else added++;
      } catch (e) {
        this.logger.warn(`Could not add ${login} to ${repo.teamSlug}: ${(e as Error).message}`);
      }
    }
    this.realtime.emitToProject(projectId, GITHUB_UPDATED, { projectId });
    return { added, pending };
  }

  async sync(user: AuthUser, slug: string) {
    this.assertConfigured();
    const ctx = await this.access.bySlug(user, slug);
    return this.syncMembers(ctx.projectId);
  }

  /** Called when someone joins or leaves a team; failures are logged, never block the team change. */
  async onMembershipChanged(projectId: string) {
    try {
      await this.syncMembers(projectId);
    } catch (e) {
      this.logger.warn(`GitHub sync after membership change failed: ${(e as Error).message}`);
    }
  }

  // ───────── helpers ─────────

  private activeMembers(projectId: string) {
    return this.prisma.teamMember.findMany({
      where: { status: TeamMemberStatus.ACTIVE, team: { projectId } },
      include: { user: { select: { ...personSelect, githubAccount: { select: { login: true } } } } },
    });
  }

  async peopleByLogin(logins: string[]) {
    const unique = [...new Set(logins.map((l) => l.toLowerCase()))];
    if (!unique.length) return new Map<string, ReturnType<typeof toPerson>>();
    const rows = await this.prisma.githubAccount.findMany({
      where: { login: { in: unique, mode: Prisma.QueryMode.insensitive } },
      include: { user: { select: personSelect } },
    });
    return new Map(rows.map((r) => [r.login.toLowerCase(), toPerson(r.user)]));
  }

  private githubError(e: unknown, what: string) {
    if (e instanceof DomainError) return e;
    const detail = e instanceof GithubApiError ? `${e.status}: ${e.message}` : (e as Error).message;
    this.logger.error(`${what}: ${detail}`);
    return new DomainError(ErrorCode.GITHUB_ERROR, `${what}. GitHub said: ${detail}`, HttpStatus.BAD_GATEWAY);
  }
}
