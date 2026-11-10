import type { DebugLanguage, FileRunReport, TestReport } from '@studywidbuddy/shared';

/** Messages between the Debug page and its Web Worker. */
export interface RunnerRequest {
  kind: 'test' | 'file';
  language: DebugLanguage;
  files: Record<string, string>;
  /** The test file, or the file to run like `node file.js` / `python file.py`. */
  entry: string;
}

export type RunnerResponse =
  | { kind: 'test'; report: TestReport; warnings: string[] }
  | { kind: 'file'; report: FileRunReport; warnings: string[] }
  | { kind: 'timeout'; seconds: number }
  | { kind: 'crash'; message: string };
