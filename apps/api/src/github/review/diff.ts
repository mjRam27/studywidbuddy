import { REVIEW_SEVERITIES, type ReviewFinding } from '@studywidbuddy/shared';
import type { GithubPrFile } from '../github-client';

/** A changed file the reviewer will read. */
export interface DiffFile {
  path: string;
  status: string;
  additions: number;
  deletions: number;
  /** The diff with new-file line numbers in front, so the model can cite exact lines. */
  numbered: string;
  /** Lines GitHub accepts comments on: added or unchanged lines inside a hunk (new-file numbers). */
  commentable: number[];
}

export interface SkippedFile {
  path: string;
  reason: string;
}

/** Budgets that keep one review's cost bounded. */
export const REVIEW_LIMITS = {
  maxFiles: 40,
  maxPatchChars: 40_000,
  chunkChars: 45_000,
  maxChunks: 6,
  maxFindings: 20,
} as const;

const HUNK = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Numbers the new-file side of a unified diff and lists the lines that can take a comment. */
export function numberPatch(patch: string): { numbered: string; commentable: number[] } {
  const out: string[] = [];
  const commentable: number[] = [];
  let line = 0;
  for (const raw of patch.split('\n')) {
    const h = HUNK.exec(raw);
    if (h) {
      line = Number(h[1]);
      out.push(raw);
      continue;
    }
    if (raw.startsWith('\\')) continue; // "\ No newline at end of file"
    const mark = raw[0];
    const text = raw.slice(1);
    if (mark === '-') {
      out.push(`     -${text}`);
    } else if (mark === '+' || mark === ' ') {
      out.push(`${String(line).padStart(5)}${mark}${text}`);
      commentable.push(line);
      line++;
    }
  }
  return { numbered: out.join('\n'), commentable };
}

const SKIP_RULES: [RegExp, string][] = [
  [
    /(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|Cargo\.lock|go\.sum|composer\.lock|Gemfile\.lock)$/,
    'lockfile',
  ],
  [/\.(min\.js|min\.css|map)$/, 'minified or source map'],
  [/(^|\/)(dist|build|out|coverage|node_modules|vendor|\.next|\.angular)\//, 'build output or vendored code'],
  [/\.(png|jpe?g|gif|webp|ico|svg|pdf|zip|gz|woff2?|ttf|eot|mp4|mp3|wav)$/i, 'binary or asset'],
  [/(^|\/)__snapshots__\/|\.snap$/, 'test snapshot'],
];

/** Decides which changed files are worth reviewing. Deleted files and generated code are skipped. */
export function triageFiles(files: GithubPrFile[]): { review: DiffFile[]; skipped: SkippedFile[] } {
  const review: DiffFile[] = [];
  const skipped: SkippedFile[] = [];
  for (const f of files) {
    const rule = SKIP_RULES.find(([re]) => re.test(f.filename));
    let reason: string | null = rule ? rule[1] : null;
    if (!reason && f.status === 'removed') reason = 'deleted';
    if (!reason && !f.patch) reason = 'no text diff (binary or too large for GitHub to show)';
    if (!reason && f.patch!.length > REVIEW_LIMITS.maxPatchChars) reason = 'diff too large to review in one pass';
    if (!reason && review.length >= REVIEW_LIMITS.maxFiles) reason = `over the ${REVIEW_LIMITS.maxFiles}-file limit`;
    if (reason) {
      skipped.push({ path: f.filename, reason });
      continue;
    }
    const { numbered, commentable } = numberPatch(f.patch!);
    if (!commentable.length) {
      skipped.push({ path: f.filename, reason: 'only removals' });
      continue;
    }
    review.push({
      path: f.filename,
      status: f.status,
      additions: f.additions,
      deletions: f.deletions,
      numbered,
      commentable,
    });
  }
  return { review, skipped };
}

/** Groups files into prompt-sized chunks (whole files only). Files past the last chunk are skipped. */
export function chunkFiles(files: DiffFile[]): { chunks: DiffFile[][]; overflow: SkippedFile[] } {
  const chunks: DiffFile[][] = [];
  const overflow: SkippedFile[] = [];
  let current: DiffFile[] = [];
  let size = 0;
  for (const f of files) {
    const n = f.numbered.length + f.path.length + 50;
    if (current.length && size + n > REVIEW_LIMITS.chunkChars) {
      chunks.push(current);
      current = [];
      size = 0;
    }
    if (chunks.length >= REVIEW_LIMITS.maxChunks) {
      overflow.push({ path: f.path, reason: 'review size limit reached' });
      continue;
    }
    current.push(f);
    size += n;
  }
  if (current.length && chunks.length < REVIEW_LIMITS.maxChunks) chunks.push(current);
  return { chunks, overflow };
}

const rank = (s: ReviewFinding['severity']) => REVIEW_SEVERITIES.indexOf(s);

/**
 * Model output is untrusted: keep only findings on a reviewed file and a line GitHub can
 * comment on, drop duplicates, most severe first, capped.
 */
export function verifyFindings(findings: ReviewFinding[], files: DiffFile[]): ReviewFinding[] {
  const lines = new Map(files.map((f) => [f.path, new Set(f.commentable)]));
  const seen = new Set<string>();
  return findings
    .filter((f) => lines.get(f.path)?.has(f.line))
    .filter((f) => {
      const key = `${f.path}:${f.line}:${f.title.toLowerCase()}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => rank(a.severity) - rank(b.severity) || a.path.localeCompare(b.path) || a.line - b.line)
    .slice(0, REVIEW_LIMITS.maxFindings);
}

/** The verdict is decided by code, not by the model: blockers or major issues mean changes are suggested. */
export function verdictFor(findings: ReviewFinding[]): 'LOOKS_GOOD' | 'CHANGES_SUGGESTED' {
  return findings.some((f) => f.severity === 'BLOCKER' || f.severity === 'MAJOR') ? 'CHANGES_SUGGESTED' : 'LOOKS_GOOD';
}
