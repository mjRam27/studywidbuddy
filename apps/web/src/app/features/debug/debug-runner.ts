import { Injectable } from '@angular/core';
import type { RunnerRequest, RunnerResponse } from './runner-protocol';

const TIMEOUT_MS = 6000;

/** Runs code in a fresh Web Worker per run; stops it after a few seconds. */
@Injectable()
export class DebugRunner {
  run(request: RunnerRequest, timeoutMs = TIMEOUT_MS): Promise<RunnerResponse> {
    return new Promise((resolve) => {
      const worker = new Worker(new URL('./debug.worker', import.meta.url), { type: 'module' });
      const done = (response: RunnerResponse) => {
        clearTimeout(timer);
        worker.terminate();
        resolve(response);
      };
      const timer = setTimeout(() => done({ kind: 'timeout', seconds: timeoutMs / 1000 }), timeoutMs);
      worker.onmessage = ({ data }: MessageEvent<RunnerResponse>) => done(data);
      worker.onerror = (e) => {
        e.preventDefault();
        done({ kind: 'crash', message: e.message || 'The runner stopped unexpectedly.' });
      };
      worker.postMessage(request);
    });
  }
}
