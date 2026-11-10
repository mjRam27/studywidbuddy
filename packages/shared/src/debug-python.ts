import type { FileRunReport, TestReport } from './debug-runner';

/**
 * Runs Python Debug exercises on Pyodide (CPython compiled to WebAssembly). The caller
 * loads Pyodide (from the CDN in the browser's worker, from npm in the API's tests) and
 * passes it in, so this module has no dependencies. Tests use a tiny Jest-like helper:
 *
 *   from testing import test, expect
 *   @test("adds the items")
 *   def _():
 *       expect(total([1, 2])).to_be(3)
 */

export interface PyodideLike {
  FS: { mkdirTree(path: string): void; writeFile(path: string, data: string): void };
  globals: { set(name: string, value: unknown): void };
  runPython(code: string): unknown;
}

/** The helper module tests import. Built in: learners don't edit it. */
export const PY_TESTING_MODULE = String.raw`"""Jest-like test helpers for StudywidBuddy Debug exercises."""

_tests = []


def test(name):
    def register(fn):
        _tests.append((name, fn))
        return fn

    return register


class Failure(AssertionError):
    pass


class _Expect:
    def __init__(self, actual):
        self.actual = actual

    def _check(self, ok, message):
        if not ok:
            raise Failure(message)

    def to_be(self, expected):
        a = self.actual
        same = a is expected or (type(a) is type(expected) and a == expected)
        self._check(same, f"expected {expected!r}, received {a!r}")

    def to_equal(self, expected):
        self._check(self.actual == expected, f"expected {expected!r}, received {self.actual!r}")

    def to_be_close_to(self, expected, digits=2):
        ok = isinstance(self.actual, (int, float)) and abs(self.actual - expected) < 10 ** -digits / 2
        self._check(ok, f"expected {self.actual!r} to be close to {expected!r}")

    def to_be_none(self):
        self._check(self.actual is None, f"expected None, received {self.actual!r}")

    def to_contain(self, item):
        self._check(item in self.actual, f"expected {self.actual!r} to contain {item!r}")

    def to_have_length(self, n):
        self._check(len(self.actual) == n, f"expected length {n}, received {len(self.actual)} ({self.actual!r})")

    def to_raise(self, error=Exception, match=None):
        try:
            self.actual()
        except error as e:
            if match is not None and match not in str(e):
                raise Failure(f"expected an error containing {match!r}, but it raised {type(e).__name__}: {e}")
            return
        except Exception as e:
            raise Failure(f"expected {error.__name__}, but it raised {type(e).__name__}: {e}")
        raise Failure(f"expected {error.__name__} to be raised, but nothing was raised")


def expect(actual):
    return _Expect(actual)
`;

/** Runs inside Pyodide for every run: fresh modules, captured output, a JSON report back. */
const DRIVER = String.raw`
import sys, io, json, importlib, traceback, runpy

def _sb_main(args):
    d = args["dir"]
    sys.dont_write_bytecode = True
    for name in args["modules"]:
        sys.modules.pop(name, None)
    importlib.invalidate_caches()
    sys.path.insert(0, d)

    def describe(e):
        where = [f for f in traceback.extract_tb(e.__traceback__) if f.filename.startswith(d + "/")]
        if isinstance(e, SyntaxError) and e.filename and e.filename.startswith(d + "/"):
            return f"SyntaxError: {e.msg} ({e.filename[len(d) + 1:]} line {e.lineno})"
        at = f" ({where[-1].filename[len(d) + 1:]} line {where[-1].lineno})" if where else ""
        return f"{type(e).__name__}: {e}{at}"

    out = io.StringIO()
    saved = sys.stdout, sys.stderr
    sys.stdout = sys.stderr = out
    report = {"results": [], "error": None}
    try:
        if args["mode"] == "test":
            try:
                testing = importlib.import_module("testing")
                importlib.import_module(args["entry"])
            except BaseException as e:
                report["error"] = describe(e)
            else:
                for name, fn in testing._tests:
                    try:
                        fn()
                        report["results"].append({"name": name, "passed": True, "error": None})
                    except testing.Failure as e:
                        report["results"].append({"name": name, "passed": False, "error": str(e)})
                    except Exception as e:
                        report["results"].append({"name": name, "passed": False, "error": describe(e)})
        else:
            try:
                runpy.run_path(d + "/" + args["entry"], run_name="__main__")
            except SystemExit:
                pass
            except BaseException as e:
                report["error"] = describe(e)
    finally:
        sys.stdout, sys.stderr = saved
        sys.path.remove(d)
    report["output"] = out.getvalue()
    return json.dumps(report)

_sb_main(json.loads(_sb_args))
`;

const moduleName = (path: string) => path.replace(/\.py$/, '').replace(/\//g, '.');
let runCount = 0;

function execute(py: PyodideLike, files: Record<string, string>, mode: 'test' | 'file', entry: string) {
  // A fresh directory per run, so no file or module from a previous run can leak in.
  const dir = `/home/pyodide/run${++runCount}`;
  py.FS.mkdirTree(dir);
  for (const [path, content] of Object.entries({ 'testing.py': PY_TESTING_MODULE, ...files })) {
    const parts = path.split('/');
    if (parts.length > 1) py.FS.mkdirTree(`${dir}/${parts.slice(0, -1).join('/')}`);
    py.FS.writeFile(`${dir}/${path}`, content);
  }
  py.globals.set(
    '_sb_args',
    JSON.stringify({
      dir,
      mode,
      entry: mode === 'test' ? moduleName(entry) : entry,
      modules: [
        'testing',
        ...Object.keys(files)
          .filter((p) => p.endsWith('.py'))
          .map(moduleName),
      ],
    }),
  );
  return JSON.parse(String(py.runPython(DRIVER))) as {
    results: TestReport['results'];
    error: string | null;
    output: string;
  };
}

const logsOf = (output: string) =>
  output
    ? output
        .replace(/\n$/, '')
        .split('\n')
        .map((text) => ({ stream: 'log' as const, text }))
    : [];

export function runPythonTests(py: PyodideLike, files: Record<string, string>, testPath: string): TestReport {
  const r = execute(py, files, 'test', testPath);
  const passed = r.results.filter((t) => t.passed).length;
  return { results: r.results, passed, failed: r.results.length - passed, logs: logsOf(r.output), error: r.error };
}

export function runPythonFile(py: PyodideLike, files: Record<string, string>, path: string): FileRunReport {
  if (!(path in files)) return { logs: [], error: `No such file: ${path}` };
  const r = execute(py, files, 'file', path);
  return { logs: logsOf(r.output), error: r.error };
}
