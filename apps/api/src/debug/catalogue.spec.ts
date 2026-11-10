import { DEBUG_MIN_BUGS, DEBUG_TEST_FILE, runTests } from '@studywidbuddy/shared';
import { CATALOGUE } from './exercises';
import { applyBugs, type ExerciseDef } from './exercise';

/**
 * Every exercise is proven solvable and every bug is proven real: the correct code passes,
 * each bug alone fails at least one test, and all bugs together fail too.
 */
const withTests = (files: Record<string, string>, ex: ExerciseDef) => ({ ...files, [DEBUG_TEST_FILE]: ex.tests });

describe('Debug catalogue', () => {
  // Deliberately buggy async code can leave a rejected promise nobody awaits (the learner's
  // browser just logs it). Without a listener, Node would turn it into a crash.
  const ignore = () => undefined;
  beforeAll(() => process.on('unhandledRejection', ignore));
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
      expect(DEBUG_TEST_FILE in ex.files).toBe(false);
    }
  });

  describe.each(CATALOGUE.map((ex) => [ex.slug, ex] as const))('%s', (_slug, ex) => {
    it('passes with the correct code', async () => {
      const report = await runTests(withTests(ex.files, ex), DEBUG_TEST_FILE);
      expect({ error: report.error, failing: report.results.filter((r) => !r.passed) }).toEqual({
        error: null,
        failing: [],
      });
      expect(report.passed).toBeGreaterThan(0);
    });

    it('fails with all the bugs in', async () => {
      const report = await runTests(withTests(applyBugs(ex.files, ex.bugs), ex), DEBUG_TEST_FILE);
      expect(report.passed).toBeLessThan(report.results.length || 1);
    });

    it.each(ex.bugs.map((b) => [b.title, b] as const))('catches the bug on its own: %s', async (_t, b) => {
      const report = await runTests(withTests(applyBugs(ex.files, [b]), ex), DEBUG_TEST_FILE);
      expect(report.error !== null || report.failed > 0).toBe(true);
    });
  });
});
