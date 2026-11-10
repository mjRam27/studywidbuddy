import type { FileRunReport, TestReport } from '@studywidbuddy/shared';
import type { TermLine } from '../../ui/terminal.component';
import type { RunnerResponse } from './runner-protocol';

/** Pure helpers for the Debug terminal: parsing commands and formatting output. */

export type TermCommand =
  | { kind: 'test' }
  | { kind: 'run'; file: string }
  | { kind: 'ls' }
  | { kind: 'cat'; file: string }
  | { kind: 'clear' }
  | { kind: 'help' }
  | { kind: 'unknown'; input: string };

export function parseCommand(input: string): TermCommand | null {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const [cmd, arg] = parts;
  if (cmd === 'test' || (cmd === 'npm' && (arg === 'test' || arg === 't'))) return { kind: 'test' };
  if ((cmd === 'node' || cmd === 'run') && arg) return { kind: 'run', file: arg.replace(/^\.\//, '') };
  if (cmd === 'ls' || cmd === 'dir') return { kind: 'ls' };
  if (cmd === 'cat' && arg) return { kind: 'cat', file: arg.replace(/^\.\//, '') };
  if (cmd === 'clear' || cmd === 'cls') return { kind: 'clear' };
  if (cmd === 'help' || cmd === '?') return { kind: 'help' };
  return { kind: 'unknown', input: input.trim() };
}

export const HELP: TermLine[] = [
  { tone: 'muted', text: 'Commands:' },
  { tone: 'plain', text: '  npm test         run the tests (also Ctrl+Enter)' },
  { tone: 'plain', text: '  node <file>      run one file and show its console output' },
  { tone: 'plain', text: '  ls / cat <file>  list files / print a file' },
  { tone: 'plain', text: '  clear            clear the terminal' },
];

const logLines = (logs: { stream: 'log' | 'error'; text: string }[]): TermLine[] =>
  logs.flatMap((l) =>
    l.text.split('\n').map((text) => ({ tone: l.stream === 'error' ? ('err' as const) : ('plain' as const), text })),
  );

export function formatTests(report: TestReport): TermLine[] {
  const out: TermLine[] = logLines(report.logs);
  if (report.error) return [...out, { tone: 'err', text: report.error }];
  for (const r of report.results) {
    out.push({ tone: r.passed ? 'ok' : 'err', text: `${r.passed ? '✓' : '✗'} ${r.name}` });
    if (r.error) out.push({ tone: 'muted', text: `    ${r.error}` });
  }
  const total = report.results.length;
  out.push({
    tone: report.failed ? 'err' : 'ok',
    text: report.failed
      ? `Tests: ${report.failed} failed, ${report.passed} passed, ${total} total`
      : `Tests: ${report.passed} passed, ${total} total`,
  });
  return out;
}

export function formatFile(report: FileRunReport): TermLine[] {
  const out = logLines(report.logs);
  if (report.error) out.push({ tone: 'err', text: report.error });
  if (!out.length) out.push({ tone: 'muted', text: '(no output: add console.log calls to see values)' });
  return out;
}

export function formatResponse(res: RunnerResponse): TermLine[] {
  switch (res.kind) {
    case 'timeout':
      return [
        {
          tone: 'err',
          text: `Stopped after ${res.seconds} s. Is there an infinite loop, or a promise that never settles?`,
        },
      ];
    case 'crash':
      return [{ tone: 'err', text: res.message }];
    case 'test':
      return [...formatTests(res.report), ...res.warnings.map((text) => ({ tone: 'warn' as const, text }))];
    case 'file':
      return [...formatFile(res.report), ...res.warnings.map((text) => ({ tone: 'warn' as const, text }))];
  }
}

/** The last run as plain text, for the assistant's context. */
export const asText = (lines: TermLine[]) => lines.map((l) => l.text).join('\n');
