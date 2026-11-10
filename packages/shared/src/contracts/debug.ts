/** Debug: fix-the-bugs exercises that run in the learner's browser. */

export type DebugLevel = 'EASY' | 'INTERMEDIATE' | 'HARD';
export const DEBUG_LEVELS: DebugLevel[] = ['EASY', 'INTERMEDIATE', 'HARD'];
export const DEBUG_LEVEL_LABEL: Record<DebugLevel, string> = {
  EASY: 'Easy',
  INTERMEDIATE: 'Intermediate',
  HARD: 'Hard',
};
/** Every exercise at a level hides at least this many bugs. */
export const DEBUG_MIN_BUGS: Record<DebugLevel, number> = { EASY: 3, INTERMEDIATE: 5, HARD: 4 };

export type BugCategory =
  | 'OFF_BY_ONE'
  | 'COMPARISON'
  | 'TYPE_COERCION'
  | 'NULL_UNDEFINED'
  | 'LOGIC'
  | 'ARRAY_METHODS'
  | 'STRINGS'
  | 'MATH'
  | 'DATES'
  | 'MUTATION'
  | 'SCOPE_CLOSURES'
  | 'ASYNC'
  | 'ERROR_HANDLING'
  | 'RECURSION'
  | 'SORTING'
  | 'REGEX'
  | 'STATE'
  | 'DATA_STRUCTURES'
  | 'SECURITY';

export const BUG_CATEGORY_LABEL: Record<BugCategory, string> = {
  OFF_BY_ONE: 'Off-by-one',
  COMPARISON: 'Comparisons',
  TYPE_COERCION: 'Type coercion',
  NULL_UNDEFINED: 'Null & undefined',
  LOGIC: 'Logic',
  ARRAY_METHODS: 'Array methods',
  STRINGS: 'Strings',
  MATH: 'Math & numbers',
  DATES: 'Dates & time',
  MUTATION: 'Mutation & references',
  SCOPE_CLOSURES: 'Scope & closures',
  ASYNC: 'Async & promises',
  ERROR_HANDLING: 'Error handling',
  RECURSION: 'Recursion',
  SORTING: 'Sorting',
  REGEX: 'Regular expressions',
  STATE: 'State & caching',
  DATA_STRUCTURES: 'Data structures',
  SECURITY: 'Security',
};
export const BUG_CATEGORIES = Object.keys(BUG_CATEGORY_LABEL) as BugCategory[];

export type DebugStatus = 'NEW' | 'IN_PROGRESS' | 'SOLVED';

/** The file the tests live in. It is read-only: the runner always uses the original. */
export const DEBUG_TEST_FILE = 'exercise.test.js';

export interface DebugExerciseSummary {
  slug: string;
  title: string;
  level: DebugLevel;
  /** One line: what the code is for. */
  topic: string;
  categories: BugCategory[];
  bugCount: number;
  estimatedMinutes: number;
  status: DebugStatus;
}

export interface DebugFile {
  path: string;
  content: string;
  readOnly: boolean;
}

export interface DebugAttemptView {
  status: DebugStatus;
  startedAt: string;
  solvedAt: string | null;
  /** Seconds from opening the exercise to the passing run. */
  durationSec: number | null;
  runs: number;
  solutionViewed: boolean;
}

/** An exercise as the learner sees it: buggy files and the tests. Never the solution. */
export interface DebugExerciseView extends Omit<DebugExerciseSummary, 'status'> {
  /** The scenario and what should happen. */
  brief: string;
  files: DebugFile[];
  attempt: DebugAttemptView | null;
}

/** One bug, revealed after solving: where it was, the fix, and why. */
export interface DebugBugReveal {
  file: string;
  line: number;
  title: string;
  category: BugCategory;
  buggy: string;
  fixed: string;
  explanation: string;
}

export interface DebugReview {
  attempt: DebugAttemptView;
  bugs: DebugBugReveal[];
  /** The learner's code at the passing run. */
  yourFiles: { path: string; content: string }[];
}

export interface DebugRunRequest {
  passed: number;
  failed: number;
  /** The learner's files at this run (stored with the solving run, for the review). */
  files: { path: string; content: string }[];
}

export interface DebugRunResponse {
  attempt: DebugAttemptView;
  /** Present when this run solved the exercise. */
  review: DebugReview | null;
}

export interface DebugAssistantMessage {
  role: 'user' | 'assistant';
  text: string;
}

export interface DebugAssistantRequest {
  message: string;
  /** The learner's current files, so the assistant talks about what's on screen. */
  files: { path: string; content: string }[];
  activeFile?: string;
  /** Output of the last test run, if any. */
  lastRun?: string;
  history?: DebugAssistantMessage[];
  /** Only when true may the assistant give the fix. The editor is never changed for the learner. */
  solution: boolean;
}

export interface DebugAssistantResponse {
  reply: string;
}

export interface DebugListQuery {
  level?: DebugLevel;
  category?: BugCategory;
  status?: DebugStatus;
  q?: string;
}

export interface DebugListResponse {
  items: DebugExerciseSummary[];
  progress: DebugProgress;
}

export interface DebugProgress {
  total: number;
  solved: number;
  byLevel: Record<DebugLevel, { total: number; solved: number }>;
}

/** The Debugging card on a profile. */
export interface DebugProfileStats {
  solved: number;
  byLevel: Record<DebugLevel, number>;
  /** Median time to solve, in seconds. */
  medianSolveSec: number | null;
  recent: { slug: string; title: string; level: DebugLevel; solvedAt: string; durationSec: number | null }[];
}
