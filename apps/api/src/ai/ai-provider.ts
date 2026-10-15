import type { z } from 'zod/v4';

/**
 * Vendor-neutral LLM interface. Domain code depends on this, never on a vendor SDK, so the
 * adapter can change without touching interviews, agents or the AI Buddy.
 */
export type AiEffort = 'low' | 'medium' | 'high';

/**
 * Which model class a call needs. 'smart' (default) for judgement: evaluations, planning,
 * agents. 'fast' for cheap, high-volume work: tutoring chat, summaries, quiz questions.
 */
export type AiTier = 'smart' | 'fast';

/** Structured content for agent loops: the model's tool calls and our results for them. */
export type AiContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean }
  /** A PDF the model reads directly (e.g. a CV). */
  | { type: 'document'; source: { type: 'base64'; media_type: 'application/pdf'; data: string }; title?: string };

export interface AiMessage {
  role: 'user' | 'assistant';
  content: string | AiContentBlock[];
}

export interface AiRequest {
  /** Short label for usage logs, e.g. "interview.questions". */
  purpose: string;
  system: string;
  messages: AiMessage[];
  maxTokens?: number;
  effort?: AiEffort;
  tier?: AiTier;
  /** The user the call is made for, for usage attribution. */
  userId?: string;
}

export interface AiStructuredRequest<T> extends AiRequest {
  schema: z.ZodType<T>;
}

export interface AiToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for the tool input. Inputs are re-validated by the caller before execution. */
  inputSchema: Record<string, unknown>;
}

export interface AiToolCall {
  id: string;
  name: string;
  /** Raw model-proposed input. Untrusted until the tool registry validates it. */
  input: unknown;
}

export interface AiToolRequest extends AiRequest {
  tools: AiToolDefinition[];
}

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiResult<T> {
  value: T;
  model: string;
  usage: AiUsage;
}

export interface AiToolResult {
  text: string;
  toolCalls: AiToolCall[];
  model: string;
  usage: AiUsage;
}

export abstract class AiProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly fastModel: string;
  abstract isConfigured(): boolean;
  abstract generate(req: AiRequest): Promise<AiResult<string>>;
  /** Output is schema-validated before it is returned; invalid output throws AiError('INVALID_OUTPUT'). */
  abstract generateStructured<T>(req: AiStructuredRequest<T>): Promise<AiResult<T>>;
  abstract stream(req: AiRequest): AsyncIterable<string>;
  /** One model turn with tools available. The caller owns the loop, validation and execution. */
  abstract toolCall(req: AiToolRequest): Promise<AiToolResult>;
}

export type AiErrorKind =
  /** No provider configured on this server. */
  | 'NOT_CONFIGURED'
  /** Transient: rate limit, overload, network. Safe to retry. */
  | 'UNAVAILABLE'
  /** The model declined the request. */
  | 'REFUSED'
  /** Output missing, truncated or failed schema validation. */
  | 'INVALID_OUTPUT'
  /** Bad request or credentials: retrying won't help. */
  | 'FATAL';

export class AiError extends Error {
  constructor(
    readonly kind: AiErrorKind,
    message: string,
  ) {
    super(message);
  }

  get retryable(): boolean {
    return this.kind === 'UNAVAILABLE' || this.kind === 'INVALID_OUTPUT';
  }
}
