/// <reference lib="webworker" />
import { runFile, runTests } from '@studywidbuddy/shared';
import type { RunnerRequest, RunnerResponse } from './runner-protocol';

/**
 * Runs the learner's code off the main thread. The page starts a fresh worker per run and
 * terminates it on a timeout, so an infinite loop can't freeze the editor.
 */
const warnings: string[] = [];

addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
  const reason = event.reason instanceof Error ? event.reason.message : String(event.reason);
  warnings.push(`Unhandled promise rejection: ${reason}`);
  event.preventDefault();
});

addEventListener('message', async ({ data }: MessageEvent<RunnerRequest>) => {
  const reply: RunnerResponse =
    data.kind === 'test'
      ? { kind: 'test', report: await runTests(data.files, data.entry), warnings }
      : { kind: 'file', report: await runFile(data.files, data.entry), warnings };
  postMessage(reply);
});
