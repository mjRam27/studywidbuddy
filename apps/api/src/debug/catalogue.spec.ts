import { DEBUG_MIN_BUGS, DEBUG_TEST_FILES, runPythonTests, runTests, type TestReport } from '@studywidbuddy/shared';
import { loadPyodide } from 'pyodide';
import { transform } from 'sucrase';
import { CATALOGUE } from './exercises';
import { applyBugs, type ExerciseDef, languageOf, testFileOf } from './exercise';

/**
 * Every exercise is proven solvable and every bug is proven real, in its own language: the
 * correct code passes, each bug alone fails at least one test, and all bugs together fail too.
 */
type Py = Parameters<typeof runPythonTests>[0];
let py: Py;

const typescript = (path: string, code: string) =>
  path.endsWith('.ts') ? transform(code, { transforms: ['typescript', 'imports'], filePath: path }).code : code;

async function run(ex: ExerciseDef, files: Record<string, string>): Promise<TestReport> {
  const all = { ...files, [testFileOf(ex)]: ex.tests };
  switch (languageOf(ex)) {
    case 'python':
      return runPythonTests(py, all, testFileOf(ex));
    case 'typescript':
      return runTests(all, testFileOf(ex), { transform: typescript });
    default:
      return runTests(all, testFileOf(ex));
  }
}

describe('Debug catalogue', () => {
  // Deliberately buggy async code can leave a rejected promise nobody awaits (the learner's
  // browser just logs it). Without a listener, Node would turn it into a crash.
  const ignore = () => undefined;
  beforeAll(async () => {
    process.on('unhandledRejection', ignore);
    py = (await loadPyodide()) as unknown as Py;
  }, 60_000);
  afterAll(() => process.off('unhandledRejection', ignore));

  it('has at least 50 exercises with unique slugs and enough bugs per level', () => {
    expect(CATALOGUE.length).toBeGreaterThanOrEqual(50);
    expect(new Set(CATALOGUE.map((e) => e.slug)).size).toBe(CATALOGUE.length);
    for (const ex of CATALOGUE) {
      expect({ slug: ex.slug, enough: ex.bugs.length >= DEBUG_MIN_BUGS[ex.level] }).toEqual({
        slug: ex.slug,
        enough: true,
      });
      expect(ex.slug).toMatch(/^[a-z0-9-]+$/);
      expect(Object.values(DEBUG_TEST_FILES).some((t) => t in ex.files)).toBe(false);
    }
  });

  it('gives every exercise more than one source file', () => {
    expect(CATALOGUE.filter((ex) => Object.keys(ex.files).length < 2).map((ex) => ex.slug)).toEqual([]);
  });

  it('offers every Easy exercise in JavaScript, TypeScript and Python', () => {
    const easy = CATALOGUE.filter((ex) => ex.level === 'EASY');
    const groups = new Map<string, string[]>();
    for (const ex of easy)
      groups.set(ex.group ?? ex.slug, [...(groups.get(ex.group ?? ex.slug) ?? []), languageOf(ex)]);
    for (const [group, languages] of groups) {
      expect({ group, languages: languages.sort() }).toEqual({
        group,
        languages: ['javascript', 'python', 'typescript'],
      });
    }
  });

  describe.each(CATALOGUE.map((ex) => [ex.slug, ex] as const))('%s', (_slug, ex) => {
    it('passes with the correct code', async () => {
      const report = await run(ex, ex.files);
      expect({ error: report.error, failing: report.results.filter((r) => !r.passed) }).toEqual({
        error: null,
        failing: [],
      });
      expect(report.passed).toBeGreaterThan(0);
    });

    it('fails with all the bugs in', async () => {
      const report = await run(ex, applyBugs(ex.files, ex.bugs));
      expect(report.passed).toBeLessThan(report.results.length || 1);
    });

    it.each(ex.bugs.map((b) => [b.title, b] as const))('catches the bug on its own: %s', async (_t, b) => {
      const report = await run(ex, applyBugs(ex.files, [b]));
      expect(report.error !== null || report.failed > 0).toBe(true);
    });
  });
});
