/// <reference lib="webworker" />
import { type PyodideLike, runFile, runPythonFile, runPythonTests, runTests } from '@studywidbuddy/shared';
import { transform } from 'sucrase';
import type { RunnerRequest, RunnerResponse } from './runner-protocol';

/**
 * Runs the learner's code off the main thread. JavaScript and TypeScript (types stripped by
 * sucrase) run in a fresh worker per run; Python runs on Pyodide, loaded once from the CDN
 * and kept in this worker. The page terminates the worker on a timeout, so an infinite
 * loop can't freeze the editor.
 */
const PYODIDE = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const warnings: string[] = [];
let pyodide: Promise<PyodideLike> | null = null;

const typescript = (path: string, code: string) =>
  path.endsWith('.ts') ? transform(code, { transforms: ['typescript', 'imports'], filePath: path }).code : code;

function python(): Promise<PyodideLike> {
  const url = `${PYODIDE}pyodide.mjs`;
  pyodide ??= (import(/* @vite-ignore */ url) as Promise<{ loadPyodide(o: object): Promise<PyodideLike> }>).then((m) =>
    m.loadPyodide({ indexURL: PYODIDE }),
  );
  return pyodide;
}

addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  warnings.push(`Unhandled promise rejection: ${reason}`);
  event.preventDefault();
});

async function handle({ kind, language, files, entry }: RunnerRequest): Promise<RunnerResponse> {
  warnings.length = 0;
  if (language === 'python') {
    let py: PyodideLike;
    try {
      py = await python();
    } catch (e) {
      pyodide = null;
      return {
        kind: 'crash',
        message: `Couldn’t load Python (${(e as Error).message}). Check your connection and try again.`,
      };
    }
    return kind === 'test'
      ? { kind, report: runPythonTests(py, files, entry), warnings: [] }
      : { kind, report: runPythonFile(py, files, entry), warnings: [] };
  }
  const options = language === 'typescript' ? { transform: typescript } : {};
  return kind === 'test'
    ? { kind, report: await runTests(files, entry, options), warnings: [...warnings] }
    : { kind, report: await runFile(files, entry, options), warnings: [...warnings] };
}

addEventListener('message', async ({ data }: MessageEvent<RunnerRequest>) => {
  try {
    postMessage(await handle(data));
  } catch (e) {
    postMessage({ kind: 'crash', message: (e as Error).message } satisfies RunnerResponse);
  }
});
