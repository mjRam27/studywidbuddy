import { Annotation, END, Send, START, StateGraph } from '@langchain/langgraph';
import type { ReviewFinding } from '@studywidbuddy/shared';
import { AiError, type AiProvider } from '../../ai/ai-provider';
import type { GithubPrFile } from '../github-client';
import { chunkFiles, type DiffFile, type SkippedFile, triageFiles, verdictFor, verifyFindings } from './diff';
import {
  ChunkReviewSchema,
  chunkReviewPrompt,
  type ReviewContext,
  ReviewSummarySchema,
  summaryPrompt,
} from './review-ai';

const concat = <T>(a: T[], b: T[]) => a.concat(b);

/**
 * The review pipeline as a LangGraph state graph:
 *
 *   START → triage ──(no reviewable files)──────────────────────────→ END
 *              └─ Send × N → reviewChunk (parallel, smart model) → verify → summarize (fast model) → END
 *
 * LangGraph does the orchestration (fan-out, joining the parallel branches through reducers,
 * conditional routing); every model call still goes through our AiProvider, so usage logging,
 * tiers and retries are the same as everywhere else. Deterministic steps (triage, line
 * checks, the verdict) are plain code from diff.ts. Fetching from and posting to GitHub stay
 * in ReviewService, which owns idempotency.
 */
export const ReviewState = Annotation.Root({
  context: Annotation<ReviewContext>,
  files: Annotation<GithubPrFile[]>,
  userId: Annotation<string | undefined>,
  review: Annotation<DiffFile[]>,
  chunks: Annotation<DiffFile[][]>,
  skipped: Annotation<SkippedFile[]>({ reducer: concat, default: () => [] }),
  /** Raw findings from every chunk (joined by the reducer), before line checks. */
  raw: Annotation<ReviewFinding[]>({ reducer: concat, default: () => [] }),
  notes: Annotation<string[]>({ reducer: concat, default: () => [] }),
  models: Annotation<string[]>({ reducer: concat, default: () => [] }),
  findings: Annotation<ReviewFinding[]>,
  verdict: Annotation<'LOOKS_GOOD' | 'CHANGES_SUGGESTED'>,
  summary: Annotation<string>,
});
export type ReviewStateValue = typeof ReviewState.State;

interface ChunkInput {
  context: ReviewContext;
  userId: string | undefined;
  chunk: DiffFile[];
  index: number;
  total: number;
}

export function buildReviewGraph(ai: AiProvider) {
  return new StateGraph(ReviewState)
    .addNode('triage', (s: ReviewStateValue) => {
      const t = triageFiles(s.files);
      const c = chunkFiles(t.review);
      return { review: t.review, chunks: c.chunks, skipped: [...t.skipped, ...c.overflow] };
    })
    .addNode('reviewChunk', async (input: ChunkInput) => {
      const prompt = chunkReviewPrompt(input.context, input.chunk, { index: input.index, total: input.total });
      const r = await ai.generateStructured({
        purpose: 'review.chunk',
        userId: input.userId,
        system: prompt.system,
        messages: [{ role: 'user', content: prompt.user }],
        schema: ChunkReviewSchema,
        effort: 'medium',
        maxTokens: 8000,
      });
      return { raw: r.value.findings, notes: [r.value.notes.trim()].filter(Boolean), models: [r.model] };
    })
    .addNode('verify', (s: ReviewStateValue) => {
      const findings = verifyFindings(s.raw, s.review);
      return { findings, verdict: verdictFor(findings) };
    })
    .addNode('summarize', async (s: ReviewStateValue) => {
      const facts = {
        notes: s.notes,
        findings: s.findings,
        verdict: s.verdict,
        filesReviewed: s.review.length,
        skipped: s.skipped,
      };
      const prompt = summaryPrompt(s.context, facts);
      try {
        const r = await ai.generateStructured({
          purpose: 'review.summary',
          userId: s.userId,
          system: prompt.system,
          messages: [{ role: 'user', content: prompt.user }],
          schema: ReviewSummarySchema,
          tier: 'fast',
          maxTokens: 1500,
        });
        return { summary: r.value.summary.trim(), models: [r.model] };
      } catch (e) {
        // The findings are the valuable part; a missing summary shouldn't lose them.
        if (!(e instanceof AiError)) throw e;
        return { summary: fallbackSummary(facts) };
      }
    })
    .addEdge(START, 'triage')
    .addConditionalEdges(
      'triage',
      (s: ReviewStateValue) =>
        s.chunks.length
          ? s.chunks.map(
              (chunk, index) =>
                new Send('reviewChunk', {
                  context: s.context,
                  userId: s.userId,
                  chunk,
                  index,
                  total: s.chunks.length,
                } satisfies ChunkInput),
            )
          : END,
      ['reviewChunk', END],
    )
    .addEdge('reviewChunk', 'verify')
    .addEdge('verify', 'summarize')
    .addEdge('summarize', END)
    .compile();
}

export function fallbackSummary(f: { findings: ReviewFinding[]; verdict: string; filesReviewed: number }): string {
  if (!f.findings.length) return `Reviewed ${f.filesReviewed} file(s) and found nothing that needs changing.`;
  const top = f.findings[0];
  return `Reviewed ${f.filesReviewed} file(s) with ${f.findings.length} finding(s). Start with ${top.path}:${top.line}: ${top.title}.`;
}
