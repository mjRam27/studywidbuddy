import { formatValue, runFile, runTests } from '@studywidbuddy/shared';

/** The JavaScript test runner the learner's browser uses (shared code). */
describe('JavaScript runner', () => {
  it('formats every kind of value readably in failure messages', () => {
    expect([true, false, null, undefined, 'hi', 3, -0, NaN].map((v) => formatValue(v))).toEqual([
      'true',
      'false',
      'null',
      'undefined',
      '"hi"',
      '3',
      '-0',
      'NaN',
    ]);
    expect(formatValue({ a: [1, 'x'], b: new Map([['k', true]]) })).toBe('{a: [1, "x"], b: Map {"k" => true}}');
  });

  it('reports passing and failing tests with expected and received values', async () => {
    const report = await runTests(
      {
        'flag.js': 'module.exports = { isOn: (x) => x > 1 };',
        't.js':
          "const { isOn } = require('./flag');\ntest('on', () => expect(isOn(2)).toBe(true));\ntest('off', () => expect(isOn(1)).toBe(true));",
      },
      't.js',
    );
    expect(report.results).toEqual([
      { name: 'on', passed: true, error: null },
      { name: 'off', passed: false, error: 'expected true, received false' },
    ]);
  });

  it('runs a file and captures what it logs, with a transform for TypeScript', async () => {
    const strip = (_path: string, code: string) => code.replace(': number', '');
    expect(
      await runFile({ 'a.ts': 'const n: number = 2;\nconsole.log("n is", n);' }, 'a.ts', { transform: strip }),
    ).toEqual({
      logs: [{ stream: 'log', text: 'n is 2' }],
      error: null,
    });
  });
});
