import {
  AiError,
  AiProvider,
  type AiRequest,
  type AiResult,
  type AiStructuredRequest,
  type AiToolRequest,
  type AiToolResult,
} from '../../src/ai/ai-provider';
import { coerceToSchema } from '../../src/ai/coerce';
import { z } from 'zod/v4';

type Scripted = unknown | AiError | ((req: AiStructuredRequest<unknown>) => unknown);

/**
 * TEST ONLY. Returns scripted outputs in order and records every request. Outputs still
 * pass through the caller's zod schema, so tests exercise the real validation path.
 */
export class ScriptedAiProvider extends AiProvider {
  readonly name = 'scripted';
  readonly model = 'scripted-model';
  readonly fastModel = 'scripted-fast-model';
  readonly calls: AiRequest[] = [];
  private readonly queue: Scripted[] = [];

  isConfigured() {
    return true;
  }

  push(...outputs: Scripted[]) {
    this.queue.push(...outputs);
    return this;
  }

  async generateStructured<T>(req: AiStructuredRequest<T>): Promise<AiResult<T>> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (next === undefined) throw new AiError('FATAL', `No scripted output left for ${req.purpose}`);
    if (next instanceof AiError) throw next;
    const raw = typeof next === 'function' ? next(req as AiStructuredRequest<unknown>) : next;
    const parsed = req.schema.safeParse(coerceToSchema(raw, z.toJSONSchema(req.schema) as never));
    if (!parsed.success) throw new AiError('INVALID_OUTPUT', parsed.error.issues[0]?.message ?? 'invalid');
    return { value: parsed.data, model: this.model, usage: { inputTokens: 100, outputTokens: 50 } };
  }

  async generate(req: AiRequest): Promise<AiResult<string>> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (next instanceof AiError) throw next;
    return { value: String(next ?? ''), model: this.model, usage: { inputTokens: 10, outputTokens: 10 } };
  }

  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<string> {
    throw new AiError('FATAL', 'stream not scripted');
  }

  /**
   * Scripted tool turns: push `{ text?, toolCalls?: [{ name, input }] }`. Tool-use ids are
   * generated, and every request (including tool results sent back) is recorded.
   */
  async toolCall(req: AiToolRequest): Promise<AiToolResult> {
    this.calls.push(req);
    const next = this.queue.shift() as
      AiError | { text?: string; toolCalls?: { name: string; input: unknown }[] } | undefined;
    if (next === undefined) throw new AiError('FATAL', `No scripted output left for ${req.purpose}`);
    if (next instanceof AiError) throw next;
    return {
      text: next.text ?? '',
      toolCalls: (next.toolCalls ?? []).map((c, i) => ({ id: `toolu_${this.calls.length}_${i}`, ...c })),
      model: this.model,
      usage: { inputTokens: 200, outputTokens: 40 },
    };
  }
}

export const sixQuestions = () => ({
  questions: [
    {
      kind: 'TECHNICAL',
      focus: 'NestJS · modules',
      prompt: 'How would you split the order service into NestJS modules, and why?',
    },
    {
      kind: 'TECHNICAL',
      focus: 'PostgreSQL · indexes',
      prompt: 'Which index would you add for "orders by customer, newest first", and why?',
    },
    {
      kind: 'TECHNICAL',
      focus: 'REST · idempotency',
      prompt: 'How would you make POST /orders safe to retry without creating duplicates?',
    },
    {
      kind: 'PROBLEM_SOLVING',
      focus: 'Driver dispatch',
      prompt: 'Two drivers accept the same order at once. Walk through how you prevent a double assignment.',
    },
    {
      kind: 'COMMUNICATION',
      focus: 'Code review',
      prompt: 'A teammate strongly disagrees with your review comment. How do you resolve it?',
    },
    {
      kind: 'PROJECT_FIT',
      focus: 'Commitment',
      prompt: 'What do you want to get out of this project, and how will you use your 10 hours a week?',
    },
  ],
});

export const evaluation = (overrides: Record<string, unknown> = {}) => ({
  technicalScore: 80,
  problemSolvingScore: 70,
  communicationScore: 60,
  projectFitScore: 90,
  strengths: ['Your answer on idempotency keys was precise.'],
  areasToImprove: ['Say more about trade-offs between locking strategies.'],
  recommendedRoleKey: 'backend',
  summary: 'You showed solid backend fundamentals and clear motivation for this project.',
  ...overrides,
});
