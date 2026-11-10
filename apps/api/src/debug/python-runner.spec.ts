import { runPythonFile, runPythonTests } from '@studywidbuddy/shared';
import { loadPyodide } from 'pyodide';

/** The Python runner on real Pyodide (the same engine the browser worker loads). */
describe('Python runner (Pyodide)', () => {
  let py: Parameters<typeof runPythonTests>[0];
  beforeAll(async () => {
    py = (await loadPyodide()) as unknown as typeof py;
  }, 60_000);

  const files = {
    'cart.py': 'def total(items):\n    return sum(i["price"] for i in items)\n',
    'test_exercise.py': [
      'from testing import test, expect',
      'from cart import total',
      '',
      '@test("adds")',
      'def _():',
      '    print("checking")',
      '    expect(total([{"price": 2}, {"price": 3}])).to_be(5)',
      '',
      '@test("an empty cart")',
      'def _():',
      '    expect(total([])).to_be(1)',
      '',
      '@test("no cart")',
      'def _():',
      '    total(None)',
      '',
    ].join('\n'),
  };

  it('reports passes, failures with values, crashes with file and line, and prints', () => {
    const r = runPythonTests(py, files, 'test_exercise.py');
    expect(r.results).toEqual([
      { name: 'adds', passed: true, error: null },
      { name: 'an empty cart', passed: false, error: 'expected 1, received 0' },
      { name: 'no cart', passed: false, error: "TypeError: 'NoneType' object is not iterable (cart.py line 2)" },
    ]);
    expect([r.passed, r.failed, r.error]).toEqual([1, 2, null]);
    expect(r.logs).toEqual([{ stream: 'log', text: 'checking' }]);
  });

  it('picks up edited files on the next run', () => {
    const r = runPythonTests(py, { ...files, 'cart.py': 'def total(items):\n    return 1\n' }, 'test_exercise.py');
    expect([r.passed, r.failed]).toEqual([2, 1]);
  });

  it('reports syntax errors and runs single files', () => {
    expect(runPythonTests(py, { 'test_exercise.py': 'def broken(:\n' }, 'test_exercise.py').error).toBe(
      'SyntaxError: invalid syntax (test_exercise.py line 1)',
    );
    expect(runPythonFile(py, { 'a.py': 'print(1 + 1)\nx = [][1]\n' }, 'a.py')).toEqual({
      logs: [{ stream: 'log', text: '2' }],
      error: 'IndexError: list index out of range (a.py line 2)',
    });
  });
});
