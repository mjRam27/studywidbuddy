/** The contribution graph on a profile: one square per day, filled only by real work. */

export type ContributionKind = 'DEBUG' | 'STUDY' | 'TASK' | 'PROJECT' | 'INTERVIEW';
export const CONTRIBUTION_KINDS: ContributionKind[] = ['DEBUG', 'STUDY', 'TASK', 'PROJECT', 'INTERVIEW'];
export const CONTRIBUTION_KIND_LABEL: Record<ContributionKind, string> = {
  DEBUG: 'Debugging',
  STUDY: 'Studying',
  TASK: 'Tasks done',
  PROJECT: 'Project work',
  INTERVIEW: 'Interviews',
};
/** A study day counts once this much time was spent in courses. */
export const STUDY_MINUTES_FOR_A_DAY = 30;

export interface ContributionDay {
  /** YYYY-MM-DD in the profile owner's timezone. */
  date: string;
  /** Things done that day (0 = an empty square). */
  count: number;
  kinds: ContributionKind[];
}

export interface ContributionCalendar {
  timezone: string;
  from: string;
  to: string;
  days: ContributionDay[];
  totals: Record<ContributionKind, number>;
  activeDays: number;
  /** Consecutive active days up to today. */
  streak: number;
}

export interface ContributionItem {
  kind: ContributionKind;
  title: string;
  detail: string | null;
  /** In-app link, when there is a page for it. */
  link: string | null;
}

export interface ContributionDayDetail {
  date: string;
  items: ContributionItem[];
}

export interface ContributionQuery {
  /** Comma-separated kinds to include; all when empty. */
  kinds?: string;
}
