import { type BugCategory, DEBUG_TEST_FILES, type DebugLanguage, type DebugLevel } from '@studywidbuddy/shared';

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
  /** JavaScript when omitted. */
  language?: DebugLanguage;
  /** Shared by the same exercise in other languages; the slug when omitted. */
  group?: string;
  title: string;
  level: DebugLevel;
  /** One line: what the code is for. */
  topic: string;
  /** The scenario and the expected behaviour (shown above the code). */
  brief: string;
  estimatedMinutes: number;
  /** The correct source files, path → content. */
  files: Record<string, string>;
  /** Tests (`test`/`expect`), served read-only under the language's test file name. */
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
export const languageOf = (ex: ExerciseDef): DebugLanguage => ex.language ?? 'javascript';
export const groupOf = (ex: ExerciseDef): string => ex.group ?? ex.slug;
export const testFileOf = (ex: ExerciseDef): string => DEBUG_TEST_FILES[languageOf(ex)];

/**
 * Moves top-level declarations (functions, classes, consts) from one file into a new file and
 * wires them back with require, so exercises span several files the way real code does. The
 * original file keeps exporting the moved names, so tests don't change; bugs whose code moved
 * now point at the new file. The catalogue spec runs the result like any other exercise.
 */
export function moveToFile(ex: ExerciseDef, from: string, to: string, names: string[]): ExerciseDef {
  let source = ex.files[from];
  if (source === undefined || to in ex.files) throw new Error(`${ex.slug}: can't move ${from} → ${to}`);
  const blocks: string[] = [];
  for (const name of names) {
    const start = new RegExp(`^(?:async function|function|class|const) ${name}(?![\\w$])`, 'm').exec(source)?.index;
    if (start === undefined) throw new Error(`${ex.slug}: ${name} not found in ${from}`);
    const firstLineEnd = source.indexOf('\n', start);
    const oneLine = source.slice(start, firstLineEnd).trimEnd().endsWith(';');
    const end = oneLine ? firstLineEnd + 1 : source.indexOf('\n', source.indexOf('\n}', start) + 1) + 1;
    blocks.push(source.slice(start, end).trimEnd());
    source = source.slice(0, start) + source.slice(end);
  }
  const module = `./${to.replace(/\.js$/, '')}`;
  const files = {
    ...ex.files,
    [from]: `const { ${names.join(', ')} } = require('${module}');\n\n${source.replace(/\n{3,}/g, '\n\n').trimStart()}`,
    [to]: `${blocks.join('\n\n')}\n\nmodule.exports = { ${names.join(', ')} };\n`,
  };
  const bugs = ex.bugs.map((b) =>
    b.file === from && !files[from].includes(b.fixed) && files[to].includes(b.fixed) ? { ...b, file: to } : b,
  );
  return { ...ex, files, bugs };
}

/** Adds extra (correct) files, e.g. a demo script learners can run with `node demo.js`. */
export const withFiles = (ex: ExerciseDef, extra: Record<string, string>): ExerciseDef => ({
  ...ex,
  files: { ...ex.files, ...extra },
});
