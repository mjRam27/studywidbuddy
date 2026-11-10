import type { BugCategory, DebugLevel } from '@studywidbuddy/shared';

/**
 * How Debug exercises are written. Authors write the CORRECT code, then list each bug as a
 * patch (`fixed` → `buggy`). The learner gets the buggy version, generated from the patches.
 * That makes every exercise checkable (catalogue.spec.ts proves the correct code passes and
 * that each bug on its own fails a test) and gives the review exact before/after lines.
 */
export interface BugDef {
  file: string;
  /** Exactly as in the correct file; must occur once. */
  fixed: string;
  buggy: string;
  category: BugCategory;
  title: string;
  explanation: string;
}

export interface ExerciseDef {
  slug: string;
  title: string;
  level: DebugLevel;
  /** One line: what the code is for. */
  topic: string;
  /** The scenario and the expected behaviour (shown above the code). */
  brief: string;
  estimatedMinutes: number;
  /** The correct source files, path → content. */
  files: Record<string, string>;
  /** Tests (CommonJS, `test`/`expect`), served read-only as exercise.test.js. */
  tests: string;
  bugs: BugDef[];
}

export const bug = (
  file: string,
  fixed: string,
  buggy: string,
  category: BugCategory,
  title: string,
  explanation: string,
): BugDef => ({ file, fixed, buggy, category, title, explanation });

/** Applies bug patches to the correct files. Throws if a patch doesn't match exactly once. */
export function applyBugs(files: Record<string, string>, bugs: BugDef[]): Record<string, string> {
  const out = { ...files };
  for (const b of bugs) {
    const text = out[b.file];
    if (text === undefined) throw new Error(`Bug "${b.title}" targets missing file ${b.file}`);
    const at = text.indexOf(b.fixed);
    if (at < 0 || text.indexOf(b.fixed, at + 1) >= 0) {
      throw new Error(`Bug "${b.title}": the fixed snippet must occur exactly once in ${b.file}`);
    }
    out[b.file] = text.slice(0, at) + b.buggy + text.slice(at + b.fixed.length);
  }
  return out;
}

/** 1-based line of each bug in the buggy files. */
export function bugLines(ex: ExerciseDef): number[] {
  const buggy = applyBugs(ex.files, ex.bugs);
  return ex.bugs.map((b) => {
    const text = buggy[b.file];
    const at = text.indexOf(b.buggy);
    return at < 0 ? 1 : text.slice(0, at).split('\n').length;
  });
}

export const categoriesOf = (ex: ExerciseDef): BugCategory[] => [...new Set(ex.bugs.map((b) => b.category))];
