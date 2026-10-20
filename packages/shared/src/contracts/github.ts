import type { ChecksStatus, CodeReviewStatus, CodeReviewVerdict, PullRequestState } from '../enums';
import type { PersonRef } from './teams';

/** Branch and PR title conventions that link code to tasks (also written into each team README). */
export const TASK_REF_PATTERN = /\bTASK[-_ ]?(\d{1,6})\b/i;

export interface GithubStatus {
  /** GitHub features are available on this server. */
  configured: boolean;
  org: string | null;
  /** The caller's linked GitHub account. */
  account: { login: string; linkedAt: string } | null;
}

export interface ConnectGithubResponse {
  /** Send the browser here; GitHub returns to the API, which redirects back to settings. */
  url: string;
}

export interface RepoMemberAccess {
  user: PersonRef;
  githubLogin: string | null;
  /** GRANTED: on the GitHub team. NOT_LINKED: hasn't connected GitHub yet. */
  access: 'GRANTED' | 'NOT_LINKED';
}

export interface PullRequestView {
  number: number;
  title: string;
  state: PullRequestState;
  draft: boolean;
  author: { login: string; user: PersonRef | null };
  headBranch: string;
  htmlUrl: string;
  task: { id: string; key: string; title: string } | null;
  checks: ChecksStatus;
  /** The AI review of the latest reviewed commit, if any. */
  aiReview: CodeReviewView | null;
  createdAt: string;
  updatedAt: string;
  mergedAt: string | null;
}

export interface ProjectRepoView {
  configured: boolean;
  repo: {
    owner: string;
    name: string;
    fullName: string;
    htmlUrl: string;
    cloneUrl: string;
    defaultBranch: string;
    private: boolean;
    createdAt: string;
  } | null;
  members: RepoMemberAccess[];
  pullRequests: PullRequestView[];
  /** Admins create the repo; members see it once it exists. */
  canCreate: boolean;
}

export type ReviewSeverity = 'BLOCKER' | 'MAJOR' | 'MINOR' | 'NIT';
export const REVIEW_SEVERITIES: ReviewSeverity[] = ['BLOCKER', 'MAJOR', 'MINOR', 'NIT'];

export type ReviewCategory = 'BUG' | 'SECURITY' | 'PERFORMANCE' | 'TESTS' | 'READABILITY' | 'DESIGN' | 'TASK_FIT';

/** One inline comment from the AI reviewer, anchored to a line the PR adds or changes. */
export interface ReviewFinding {
  path: string;
  line: number;
  severity: ReviewSeverity;
  category: ReviewCategory;
  title: string;
  body: string;
  /** Replacement code for the line(s), when the fix is small and certain. */
  suggestion?: string;
}

export interface CodeReviewView {
  id: string;
  headSha: string;
  status: CodeReviewStatus;
  verdict: CodeReviewVerdict | null;
  summary: string | null;
  findings: ReviewFinding[];
  filesReviewed: number;
  filesSkipped: number;
  skippedReason: string | null;
  failureReason: string | null;
  githubUrl: string | null;
  createdAt: string;
  postedAt: string | null;
}
