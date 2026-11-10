import { Injectable, type OnDestroy } from '@angular/core';
import type { RunnerRequest, RunnerResponse } from './runner-protocol';

const TIMEOUT_MS = 6000;
/** The first Python run downloads and starts the interpreter (about 10 MB). */
const PYTHON_FIRST_RUN_MS = 90_000;

/**
 * Runs code in a Web Worker and stops it after a few seconds. JavaScript and TypeScript get
 * a fresh worker per run; Python keeps one worker so the interpreter loads only once.
 */
@Injectable()
export class DebugRunner implements OnDestroy {
  private python: Worker | null = null;
  private pythonReady = false;

  /** True until the first Python run has loaded the interpreter. */
  get pythonLoading() {
    return !this.pythonReady;
  }

  run(request: RunnerRequest): Promise<RunnerResponse> {
    const keep = request.language === 'python';
    const worker = keep ? (this.python ??= this.spawn()) : this.spawn();
    const timeoutMs = keep && !this.pythonReady ? PYTHON_FIRST_RUN_MS : TIMEOUT_MS;
    return new Promise((resolve) => {
      const done = (response: RunnerResponse, kill: boolean) => {
        clearTimeout(timer);
        worker.onmessage = null;
        worker.onerror = null;
        if (kill || !keep) {
          worker.terminate();
          if (keep) {
            this.python = null;
            this.pythonReady = false;
          }
        } else {
          this.pythonReady = response.kind !== 'crash';
        }
        resolve(response);
      };
      const timer = setTimeout(() => done({ kind: 'timeout', seconds: timeoutMs / 1000 }, true), timeoutMs);
      worker.onmessage = ({ data }: MessageEvent<RunnerResponse>) => done(data, false);
      worker.onerror = (e) => {
        e.preventDefault();
        done({ kind: 'crash', message: e.message || 'The runner stopped unexpectedly.' }, true);
      };
      worker.postMessage(request);
    });
  }

  ngOnDestroy() {
    this.python?.terminate();
  }

  private spawn() {
    return new Worker(new URL('./debug.worker', import.meta.url), { type: 'module' });
  }
}
