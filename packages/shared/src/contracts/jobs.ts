import type { JobSource, SkillLevel } from '../enums';
import type { Page } from './common';

/** Display names and attribution links for job sources (their terms ask for credit). */
export const JOB_SOURCES: Record<JobSource, { label: string; url: string }> = {
  ARBEITNOW: { label: 'Arbeitnow', url: 'https://www.arbeitnow.com' },
  REMOTIVE: { label: 'Remotive', url: 'https://remotive.com' },
  ADZUNA: { label: 'Adzuna', url: 'https://www.adzuna.com' },
};

/** How a listing's skills compare with what the viewer has shown. */
export interface JobMatchView {
  /** 0–100, or null when no catalogue skill was found in the listing. */
  score: number | null;
  /** Skills the viewer has: proven ones (finished courses/projects) count fully, claimed ones less. */
  matched: { name: string; proven: boolean; level: SkillLevel }[];
  /** Skills the listing asks for that the viewer hasn't shown yet. */
  gaps: string[];
}

export interface JobSummary {
  id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  employment: string | null;
  postedAt: string;
  source: JobSource;
  /** The original posting: Apply always goes there. */
  url: string;
  skills: string[];
  match: JobMatchView;
}

export interface JobDetail extends JobSummary {
  description: string;
  tags: string[];
  /** Catalogue courses that teach the gaps. */
  courses: { slug: string; title: string; covers: string[] }[];
}

export interface JobListQuery {
  q?: string;
  remote?: boolean;
  /** 'matched' (default): only listings sharing at least one skill with the viewer. */
  scope?: 'matched' | 'all';
  cursor?: string;
}

export interface JobListResponse extends Page<JobSummary> {
  /** When the listings were last refreshed from the sources. */
  lastSyncAt: string | null;
  /** The viewer has no skills on their profile yet, so nothing can be matched. */
  noSkills: boolean;
}
