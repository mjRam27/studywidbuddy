/**
 * A tiny CommonJS + test runner for Debug exercises. Pure JavaScript with no DOM or Node
 * APIs, so the same code runs in the learner's browser (inside a Web Worker, which the page
 * terminates on a timeout) and in the API's test suite (which proves every exercise is
 * solvable). It is not a security boundary: it only ever runs the learner's own code in the
 * learner's own browser.
 */

export interface RunLog {
  stream: 'log' | 'error';
  text: string;
}

export interface TestResult {
  name: string;
  passed: boolean;
  error: string | null;
}

export interface TestReport {
  results: TestResult[];
  passed: number;
  failed: number;
  logs: RunLog[];
  /** A problem before any test ran (syntax error, missing module …). */
  error: string | null;
}

export interface FileRunReport {
  logs: RunLog[];
  error: string | null;
}

type Files = Record<string, string>;
type Fn = (...args: unknown[]) => unknown;

const TEST_TIMEOUT_MS = 2000;

// ───────── formatting and equality ─────────

export function formatValue(v: unknown, depth = 0): string {
  if (typeof v === 'string') return depth ? JSON.stringify(v) : JSON.stringify(v);
  if (typeof v === 'number') return Object.is(v, -0) ? '-0' : String(v);
  if (typeof v === 'bigint') return `${v}n`;
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'function') return `[Function ${v.name || 'anonymous'}]`;
  if (typeof v === 'symbol') return v.toString();
  if (v instanceof Error) return `${v.name}: ${v.message}`;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? 'Invalid Date' : v.toISOString();
  if (depth > 3) return Array.isArray(v) ? '[…]' : '{…}';
  if (Array.isArray(v)) return `[${v.map((x) => formatValue(x, depth + 1)).join(', ')}]`;
  if (v instanceof Map) {
    return `Map {${[...v].map(([k, x]) => `${formatValue(k, depth + 1)} => ${formatValue(x, depth + 1)}`).join(', ')}}`;
  }
  if (v instanceof Set) return `Set {${[...v].map((x) => formatValue(x, depth + 1)).join(', ')}}`;
  const entries = Object.entries(v as object);
  return `{${entries.map(([k, x]) => `${k}: ${formatValue(x, depth + 1)}`).join(', ')}}`;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (a instanceof Map || b instanceof Map) {
    if (!(a instanceof Map && b instanceof Map) || a.size !== b.size) return false;
    return [...a].every(([k, v]) => b.has(k) && deepEqual(v, b.get(k)));
  }
  if (a instanceof Set || b instanceof Set) {
    if (!(a instanceof Set && b instanceof Set) || a.size !== b.size) return false;
    return [...a].every((v) => b.has(v));
  }
  const ka = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const kb = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

// ───────── expect ─────────

class AssertionError extends Error {}

function makeExpect() {
  const check = (pass: boolean, negate: boolean, message: string) => {
    if (pass === negate) throw new AssertionError(negate ? `Expected not: ${message}` : message);
  };

  function matchers(actual: unknown, negate: boolean) {
    const got = () => formatValue(actual);
    return {
      toBe: (expected: unknown) =>
        check(Object.is(actual, expected), negate, `expected ${formatValue(expected)}, received ${got()}`),
      toEqual: (expected: unknown) =>
        check(deepEqual(actual, expected), negate, `expected ${formatValue(expected)}, received ${got()}`),
      toBeTruthy: () => check(!!actual, negate, `expected a truthy value, received ${got()}`),
      toBeFalsy: () => check(!actual, negate, `expected a falsy value, received ${got()}`),
      toBeNull: () => check(actual === null, negate, `expected null, received ${got()}`),
      toBeUndefined: () => check(actual === undefined, negate, `expected undefined, received ${got()}`),
      toBeDefined: () => check(actual !== undefined, negate, `expected a defined value, received undefined`),
      toBeNaN: () => check(Number.isNaN(actual), negate, `expected NaN, received ${got()}`),
      toContain: (item: unknown) =>
        check(
          typeof actual === 'string'
            ? actual.includes(String(item))
            : Array.isArray(actual) && actual.some((x) => Object.is(x, item)),
          negate,
          `expected ${got()} to contain ${formatValue(item)}`,
        ),
      toHaveLength: (n: number) =>
        check(
          (actual as { length?: number })?.length === n,
          negate,
          `expected length ${n}, received ${(actual as { length?: number })?.length} (${got()})`,
        ),
      toBeGreaterThan: (n: number) => check((actual as number) > n, negate, `expected ${got()} to be > ${n}`),
      toBeLessThan: (n: number) => check((actual as number) < n, negate, `expected ${got()} to be < ${n}`),
      toBeCloseTo: (n: number, digits = 2) =>
        check(Math.abs((actual as number) - n) < 10 ** -digits / 2, negate, `expected ${got()} to be close to ${n}`),
      toMatch: (re: RegExp | string) =>
        check(
          typeof actual === 'string' && (typeof re === 'string' ? actual.includes(re) : re.test(actual)),
          negate,
          `expected ${got()} to match ${String(re)}`,
        ),
      toThrow: (expected?: string | RegExp) => {
        let threw = false;
        let message = '';
        try {
          (actual as () => unknown)();
        } catch (e) {
          threw = true;
          message = e instanceof Error ? e.message : String(e);
        }
        const matches =
          threw &&
          (expected === undefined ||
            (typeof expected === 'string' ? message.includes(expected) : expected.test(message)));
        check(
          matches,
          negate,
          threw
            ? `expected an error matching ${String(expected)}, but it threw "${message}"`
            : 'expected the function to throw, but it did not',
        );
      },
    };
  }

  type Matchers = ReturnType<typeof matchers>;
  type Async<T> = { [K in keyof T]: T[K] extends (...a: infer A) => unknown ? (...a: A) => Promise<void> : never };

  return (actual: unknown) => {
    const resolved = async (negate: boolean, name: keyof Matchers, args: unknown[]) => {
      let value: unknown;
      try {
        value = await actual;
      } catch (e) {
        throw new AssertionError(
          `expected the promise to resolve, but it rejected with "${(e as Error)?.message ?? e}"`,
        );
      }
      (matchers(value, negate)[name] as Fn)(...args);
    };
    const rejected = async (negate: boolean, name: keyof Matchers, args: unknown[]) => {
      try {
        await actual;
      } catch (e) {
        (matchers(e instanceof Error ? e.message : e, negate)[name] as Fn)(...args);
        return;
      }
      throw new AssertionError('expected the promise to reject, but it resolved');
    };
    const proxy = (run: typeof resolved, negate: boolean) =>
      new Proxy({} as Async<Matchers>, {
        get:
          (_t, name: string) =>
          (...args: unknown[]) =>
            run(negate, name as keyof Matchers, args),
      });
    return {
      ...matchers(actual, false),
      not: matchers(actual, true),
      resolves: Object.assign(proxy(resolved, false), { not: proxy(resolved, true) }),
      rejects: proxy(rejected, false),
    };
  };
}

// ───────── modules ─────────

function resolvePath(from: string, spec: string, files: Files): string {
  if (!spec.startsWith('./') && !spec.startsWith('../')) {
    throw new Error(`Cannot find module '${spec}'. Only the exercise's own files can be required.`);
  }
  const parts = from.split('/').slice(0, -1);
  for (const p of spec.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.' && p !== '') parts.push(p);
  }
  const base = parts.join('/');
  for (const candidate of [base, `${base}.js`, `${base}/index.js`]) {
    if (candidate in files) return candidate;
  }
  throw new Error(`Cannot find module '${spec}' from '${from}'.`);
}

function makeConsole(logs: RunLog[]) {
  const write =
    (stream: RunLog['stream']) =>
    (...args: unknown[]) =>
      logs.push({ stream, text: args.map((a) => (typeof a === 'string' ? a : formatValue(a))).join(' ') });
  return { log: write('log'), info: write('log'), warn: write('error'), error: write('error') };
}

function makeLoader(files: Files, globals: Record<string, unknown>) {
  const cache = new Map<string, { exports: unknown }>();
  const names = ['require', 'module', 'exports', ...Object.keys(globals)];
  const load = (path: string): unknown => {
    const cached = cache.get(path);
    if (cached) return cached.exports;
    const module = { exports: {} as unknown };
    cache.set(path, module);
    const fn = new Function(...names, `"use strict";\n${files[path]}\n//# sourceURL=${path}`) as Fn;
    fn((spec: string) => load(resolvePath(path, spec, files)), module, module.exports, ...Object.values(globals));
    return module.exports;
  };
  return load;
}

const describeError = (e: unknown) =>
  e instanceof AssertionError
    ? e.message
    : e instanceof Error
      ? `${e.name}: ${e.message}`
      : `Thrown: ${formatValue(e)}`;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    p,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out after ${ms} ms (is a promise never settled?)`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

// ───────── public API ─────────

/** Runs the test file against the files. Modules load once per run, shared by the tests (like Jest). */
export async function runTests(files: Files, testPath: string, timeoutMs = TEST_TIMEOUT_MS): Promise<TestReport> {
  const logs: RunLog[] = [];
  const console = makeConsole(logs);
  const tests: { name: string; fn: Fn }[] = [];
  const prefix: string[] = [];
  const collect = {
    console,
    expect: makeExpect(),
    test: (name: string, fn: Fn) => tests.push({ name: [...prefix, name].join(' › '), fn }),
    it: (name: string, fn: Fn) => tests.push({ name: [...prefix, name].join(' › '), fn }),
    describe: (name: string, fn: () => void) => {
      prefix.push(name);
      try {
        fn();
      } finally {
        prefix.pop();
      }
    },
  };
  try {
    makeLoader(files, collect)(testPath);
  } catch (e) {
    return { results: [], passed: 0, failed: 0, logs, error: describeError(e) };
  }
  const results: TestResult[] = [];
  for (const t of tests) {
    try {
      await withTimeout(
        Promise.resolve().then(() => t.fn()),
        timeoutMs,
      );
      results.push({ name: t.name, passed: true, error: null });
    } catch (e) {
      results.push({ name: t.name, passed: false, error: describeError(e) });
    }
  }
  const passed = results.filter((r) => r.passed).length;
  return { results, passed, failed: results.length - passed, logs, error: null };
}

/** Runs one file like `node file.js`, capturing console output. */
export async function runFile(files: Files, path: string): Promise<FileRunReport> {
  const logs: RunLog[] = [];
  if (!(path in files)) return { logs, error: `No such file: ${path}` };
  try {
    const exported = makeLoader(files, { console: makeConsole(logs) })(path);
    if (exported instanceof Promise) await withTimeout(exported, TEST_TIMEOUT_MS);
    return { logs, error: null };
  } catch (e) {
    return { logs, error: describeError(e) };
  }
}
