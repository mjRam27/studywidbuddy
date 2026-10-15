import type {
  ApplicationOutcomeReason,
  ApplicationStatus,
  CvScreeningStatus,
  ProjectStatus,
  SkillLevel,
} from '../enums';
import type { SkillRef } from './common';

export interface ProjectRoleView {
  id: string;
  key: string;
  title: string;
  description: string;
  seats: number;
  /** Seats not yet filled by selected team members. */
  open: number;
  requiredSkills: (SkillRef & { minLevel: SkillLevel })[];
}

export interface ProjectSummary {
  id: string;
  slug: string;
  title: string;
  /** Display category, e.g. "LOGISTICS · WEB PLATFORM". */
  category: string;
  summary: string;
  difficulty: SkillLevel;
  status: ProjectStatus;
  durationWeeks: number;
  teamSize: number;
  techStack: SkillRef[];
  roles: { key: string; title: string; seats: number; open: number }[];
  applicationDeadline: string | null;
  applicantCount: number;
  /** Which of the project's tech-stack skills the caller has. Null for anonymous callers. */
  skillMatch: { matched: number; total: number; matchedSkillIds: string[] } | null;
}

export interface ProjectDetail extends Omit<ProjectSummary, 'roles'> {
  description: string;
  problem: string;
  roles: ProjectRoleView[];
  startsAt: string | null;
  myApplication: { id: string; status: ApplicationStatus; roleTitle: string } | null;
}

export interface ProjectListQuery {
  q?: string;
  difficulty?: SkillLevel;
  skill?: string;
  role?: string;
  cursor?: string;
  limit?: number;
}

export interface CreateApplicationRequest {
  roleId: string;
  motivation: string;
  availabilityHoursPerWeek: number;
  relevantExperience?: string;
}

export interface ApplicationEventView {
  status: ApplicationStatus;
  at: string;
}

export interface ApplicationView {
  id: string;
  status: ApplicationStatus;
  motivation: string;
  availabilityHoursPerWeek: number;
  relevantExperience: string | null;
  submittedAt: string;
  updatedAt: string;
  project: { id: string; slug: string; title: string; difficulty: SkillLevel };
  role: { id: string; key: string; title: string };
  history: ApplicationEventView[];
  cv: { fileName: string; sizeBytes: number } | null;
  screening: CvScreeningView | null;
  interview: { id: string; status: string; scheduledFor: string | null; overallScore: number | null } | null;
  /** Why the application ended without a seat, with next steps. */
  outcome: ApplicationOutcomeView | null;
  /** The team seat, once assigned. */
  seat: { projectSlug: string; roleTitle: string } | null;
}

export interface CvScreeningView {
  status: CvScreeningStatus;
  /** 0–100, computed from the sub-scores. */
  atsScore: number | null;
  passScore: number;
  breakdown: { label: string; score: number; weight: number }[];
  matchedSkills: string[];
  missingSkills: string[];
  feedback: string | null;
  failureMessage: string | null;
}

export interface ApplicationOutcomeView {
  reason: ApplicationOutcomeReason;
  feedback: string | null;
  /** Real catalogue courses that teach what was missing. */
  courses: { slug: string; title: string; reason: string }[];
  /** Open projects with a free seat in a similar role. */
  projects: { slug: string; title: string; roleTitle: string; open: number }[];
}
