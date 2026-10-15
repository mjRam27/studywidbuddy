import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Logger } from '@nestjs/common';
import { z } from 'zod/v4';
import {
  AiError,
  AiProvider,
  type AiRequest,
  type AiResult,
  type AiStructuredRequest,
  type AiToolRequest,
  type AiToolResult,
  type AiUsage,
} from './ai-provider';
import type { AiUsageService } from './ai-usage.service';
import { coerceToSchema } from './coerce';

const DEFAULT_MAX_TOKENS = 16000;

/**
 * Server-side refusal fallback: if the model declines on a safety classifier, the API reruns
 * the request on a fallback model inside the same call. Routed by refusal category.
 */
const FALLBACK: { betas: Anthropic.Beta.AnthropicBeta[]; fallbacks: 'default' } = {
  betas: ['server-side-fallback-2026-07-01'],
  fallbacks: 'default',
};

interface Completed<T> {
  value: T;
  model: string;
  usage: AiUsage;
}

/** Claude adapter. The SDK retries 408/409/429/5xx and connection errors (maxRetries). */
export class AnthropicProvider extends AiProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;
  private readonly logger = new Logger(AnthropicProvider.name);

  constructor(
    apiKey: string,
    readonly model: string,
    readonly fastModel: string,
    private readonly usage: AiUsageService,
  ) {
    super();
    this.client = new Anthropic({ apiKey, maxRetries: 2, timeout: 120_000 });
  }

  isConfigured() {
    return true;
  }

  generate(req: AiRequest): Promise<AiResult<string>> {
    return this.track(req, async () => {
      const res = await this.client.beta.messages.create({
        ...FALLBACK,
        ...this.modelFor(req),
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: req.messages as Anthropic.Beta.BetaMessageParam[],
      });
      this.assertCompleted(res.stop_reason);
      return { value: textOf(res.content), model: res.model, usage: usageOf(res.usage) };
    });
  }

  generateStructured<T>(req: AiStructuredRequest<T>): Promise<AiResult<T>> {
    return this.track(req, async () => {
      // create(), not parse(): we validate ourselves after bringing the JSON within the
      // schema's limits, which structured outputs pass to the model only as hints.
      const format = betaZodOutputFormat(req.schema);
      const res = await this.client.beta.messages.create({
        ...FALLBACK,
        ...this.modelFor(req),
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: req.messages as Anthropic.Beta.BetaMessageParam[],
        output_config: { ...this.modelFor(req).output_config, format: { type: format.type, schema: format.schema } },
      });
      this.assertCompleted(res.stop_reason);
      let raw: unknown;
      try {
        raw = JSON.parse(textOf(res.content));
      } catch {
        throw new AiError('INVALID_OUTPUT', 'Model output was not valid JSON.');
      }
      const checked = req.schema.safeParse(coerceToSchema(raw, z.toJSONSchema(req.schema) as never));
      if (!checked.success) {
        const issue = checked.error.issues[0];
        throw new AiError(
          'INVALID_OUTPUT',
          `Model output failed validation at ${issue?.path.join('.') || 'root'}: ${issue?.message}`,
        );
      }
      return { value: checked.data, model: res.model, usage: usageOf(res.usage) };
    });
  }

  async *stream(req: AiRequest): AsyncIterable<string> {
    const started = Date.now();
    try {
      const stream = this.client.beta.messages.stream({
        ...FALLBACK,
        ...this.modelFor(req),
        max_tokens: req.maxTokens ?? 64000,
        system: req.system,
        messages: req.messages as Anthropic.Beta.BetaMessageParam[],
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') yield event.delta.text;
      }
      const final = await stream.finalMessage();
      this.assertCompleted(final.stop_reason);
      await this.usage.record(req, this.name, final.model, usageOf(final.usage), Date.now() - started, true);
    } catch (e) {
      const err = this.toAiError(e);
      await this.usage.record(req, this.name, this.modelFor(req).model, null, Date.now() - started, false, err.kind);
      throw err;
    }
  }

  toolCall(req: AiToolRequest): Promise<AiToolResult> {
    return this.track(req, async () => {
      const res = await this.client.beta.messages.create({
        ...FALLBACK,
        ...this.modelFor(req),
        max_tokens: req.maxTokens ?? DEFAULT_MAX_TOKENS,
        system: req.system,
        messages: req.messages as Anthropic.Beta.BetaMessageParam[],
        tools: req.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema,
        })),
        tool_choice: { type: 'auto' },
      });
      this.assertCompleted(res.stop_reason);
      const toolCalls = res.content.flatMap((b) =>
        b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : [],
      );
      return { value: { toolCalls, text: textOf(res.content) }, model: res.model, usage: usageOf(res.usage) };
    }).then((r) => ({ ...r.value, model: r.model, usage: r.usage }));
  }

  /**
   * Model and effort for a request. Effort only applies to the smart tier; the fast tier is
   * used where latency and cost matter more than depth.
   */
  private modelFor(req: AiRequest) {
    return req.tier === 'fast'
      ? { model: this.fastModel, output_config: {} }
      : { model: this.model, output_config: { effort: req.effort ?? 'medium' } };
  }

  /** Runs one call, logs usage either way, and normalises SDK errors into AiError. */
  private async track<T>(req: AiRequest, fn: () => Promise<Completed<T>>): Promise<AiResult<T>> {
    const started = Date.now();
    try {
      const out = await fn();
      await this.usage.record(req, this.name, out.model, out.usage, Date.now() - started, true);
      return out;
    } catch (e) {
      const err = this.toAiError(e);
      await this.usage.record(req, this.name, this.modelFor(req).model, null, Date.now() - started, false, err.kind);
      if (err.kind === 'FATAL') this.logger.error(`AI call "${req.purpose}" failed: ${err.message}`);
      throw err;
    }
  }

  private assertCompleted(stop: string | null) {
    if (stop === 'refusal') throw new AiError('REFUSED', 'The model declined this request.');
    if (stop === 'max_tokens') throw new AiError('INVALID_OUTPUT', 'The model ran out of output tokens.');
  }

  private toAiError(e: unknown): AiError {
    if (e instanceof AiError) return e;
    // Output that didn't fit the schema is worth retrying (a new sample usually fits).
    if (e instanceof Error && /Failed to parse structured output/.test(e.message)) {
      return new AiError('INVALID_OUTPUT', 'Model output failed validation.');
    }
    if (
      e instanceof Anthropic.RateLimitError ||
      e instanceof Anthropic.InternalServerError ||
      e instanceof Anthropic.APIConnectionError
    ) {
      return new AiError('UNAVAILABLE', 'The AI provider is busy or unreachable.');
    }
    if (e instanceof Anthropic.APIError) {
      return new AiError(
        e.status && e.status >= 500 ? 'UNAVAILABLE' : 'FATAL',
        `AI provider error ${e.status ?? ''}: ${e.message}`,
      );
    }
    return new AiError('FATAL', e instanceof Error ? e.message : 'Unknown AI error');
  }
}

function textOf(content: Anthropic.Beta.BetaContentBlock[]): string {
  return content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
}

function usageOf(u: { input_tokens: number; output_tokens: number }): AiUsage {
  return { inputTokens: u.input_tokens, outputTokens: u.output_tokens };
}
