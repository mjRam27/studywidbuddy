import {
  DEBUG_LEVELS,
  DEBUG_TEST_FILE,
  type DebugBugReveal,
  type DebugExerciseSummary,
  type DebugFile,
  type DebugListQuery,
  type DebugProgress,
  type DebugStatus,
} from '@studywidbuddy/shared';
import { applyBugs, bugLines, categoriesOf, type ExerciseDef } from './exercise';
import { CATALOGUE } from './exercises';

/** Pure helpers over the exercise catalogue; DebugService adds the learner's progress. */

const BY_SLUG = new Map(CATALOGUE.map((ex) => [ex.slug, ex]));

export const findExercise = (slug: string): ExerciseDef | undefined => BY_SLUG.get(slug);

export function toSummary(ex: ExerciseDef, status: DebugStatus): DebugExerciseSummary {
  return {
    slug: ex.slug,
    title: ex.title,
    level: ex.level,
    topic: ex.topic,
    categories: categoriesOf(ex),
    bugCount: ex.bugs.length,
    estimatedMinutes: ex.estimatedMinutes,
    status,
  };
}

/** The files the learner gets: the buggy sources (editable) and the tests (read-only). */
export function learnerFiles(ex: ExerciseDef): DebugFile[] {
  const buggy = applyBugs(ex.files, ex.bugs);
  return [
    ...Object.keys(ex.files).map((path) => ({ path, content: buggy[path], readOnly: false })),
    { path: DEBUG_TEST_FILE, content: ex.tests, readOnly: true },
  ];
}

export function revealBugs(ex: ExerciseDef): DebugBugReveal[] {
  const lines = bugLines(ex);
  return ex.bugs.map((b, i) => ({
    file: b.file,
    line: lines[i],
    title: b.title,
    category: b.category,
    buggy: b.buggy,
    fixed: b.fixed,
    explanation: b.explanation,
  }));
}

export function filterCatalogue(
  query: DebugListQuery,
  statusOf: (slug: string) => DebugStatus,
  catalogue: ExerciseDef[] = CATALOGUE,
): DebugExerciseSummary[] {
  const q = query.q?.trim().toLowerCase();
  return catalogue
    .map((ex) => toSummary(ex, statusOf(ex.slug)))
    .filter(
      (s) =>
        (!query.level || s.level === query.level) &&
        (!query.category || s.categories.includes(query.category)) &&
        (!query.status || s.status === query.status) &&
        (!q || s.title.toLowerCase().includes(q) || s.topic.toLowerCase().includes(q)),
    );
}

export function progressOf(solved: Set<string>, catalogue: ExerciseDef[] = CATALOGUE): DebugProgress {
  const byLevel = Object.fromEntries(DEBUG_LEVELS.map((l) => [l, { total: 0, solved: 0 }])) as DebugProgress['byLevel'];
  for (const ex of catalogue) {
    byLevel[ex.level].total++;
    if (solved.has(ex.slug)) byLevel[ex.level].solved++;
  }
  return { total: catalogue.length, solved: [...solved].filter((s) => BY_SLUG.has(s)).length, byLevel };
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}
