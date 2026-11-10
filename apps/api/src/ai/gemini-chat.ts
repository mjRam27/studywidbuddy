import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';
import { AiError } from './ai-provider';
import { AiUsageService } from './ai-usage.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  text: string;
}

export interface ChatRequest {
  /** Short label for usage logs, e.g. "debug.assistant". */
  purpose: string;
  userId?: string;
  system: string;
  turns: ChatTurn[];
  maxTokens?: number;
}

/**
 * Plain-text chat with Google Gemini, for conversational helpers that should stay cheap
 * and fast (the Debug coach). Judging people and changing state stay on AiProvider.
 * Tests replace this class; nothing in the suite calls Google.
 */
export abstract class GeminiChat {
  abstract readonly configured: boolean;
  abstract reply(req: ChatRequest): Promise<string>;
}

/** A busy model often hangs instead of refusing; don't let the learner wait for it. */
const PRIMARY_TIMEOUT_MS = 20_000;
const LAST_TIMEOUT_MS = 45_000;

@Injectable()
export class HttpGeminiChat extends GeminiChat {
  private readonly logger = new Logger(HttpGeminiChat.name);

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly usage: AiUsageService,
  ) {
    super();
  }

  get configured() {
    return !!this.env.GEMINI_API_KEY;
  }

  /**
   * Gemini models are sometimes overloaded ("high demand"), and then they either refuse or
   * hang. The main model gets a short time limit; when it is busy, the fallback model answers.
   */
  async reply(req: ChatRequest): Promise<string> {
    if (!this.env.GEMINI_API_KEY) throw new AiError('NOT_CONFIGURED', 'GEMINI_API_KEY is not set.');
    const primary = this.env.GEMINI_MODEL;
    const fallback = this.env.GEMINI_FALLBACK_MODEL;
    const plan = [
      { model: primary, timeoutMs: fallback && fallback !== primary ? PRIMARY_TIMEOUT_MS : LAST_TIMEOUT_MS },
      ...(fallback && fallback !== primary ? [{ model: fallback, timeoutMs: LAST_TIMEOUT_MS }] : []),
    ];
    let lastError: AiError | null = null;
    for (const { model, timeoutMs } of plan) {
      try {
        return await this.call(model, req, timeoutMs);
      } catch (e) {
        if (!(e instanceof AiError) || !e.retryable) throw e;
        lastError = e;
      }
    }
    throw lastError!;
  }

  private async call(model: string, req: ChatRequest, timeoutMs: number): Promise<string> {
    const started = Date.now();
    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-goog-api-key': this.env.GEMINI_API_KEY! },
          signal: AbortSignal.timeout(timeoutMs),
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: req.system }] },
            contents: req.turns.map((t) => ({
              role: t.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: t.text }],
            })),
            generationConfig: { maxOutputTokens: req.maxTokens ?? 2048, temperature: 0.4 },
          }),
        },
      );
    } catch (e) {
      await this.usage.record(req, 'gemini', model, null, Date.now() - started, false, 'UNAVAILABLE');
      throw new AiError('UNAVAILABLE', `Gemini request failed: ${(e as Error).message}`);
    }
    const body = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[];
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
      error?: { message?: string };
    } | null;
    const tokens = {
      inputTokens: body?.usageMetadata?.promptTokenCount ?? 0,
      outputTokens: body?.usageMetadata?.candidatesTokenCount ?? 0,
    };
    if (!res.ok) {
      const kind = res.status === 429 || res.status >= 500 ? 'UNAVAILABLE' : 'FATAL';
      await this.usage.record(req, 'gemini', model, tokens, Date.now() - started, false, kind);
      this.logger.warn(`Gemini ${model} ${req.purpose} failed: ${body?.error?.message ?? res.status}`);
      throw new AiError(kind, body?.error?.message ?? `HTTP ${res.status}`);
    }
    const text = (body?.candidates?.[0]?.content?.parts ?? [])
      .filter((p) => !p.thought)
      .map((p) => p.text ?? '')
      .join('')
      .trim();
    await this.usage.record(
      req,
      'gemini',
      model,
      tokens,
      Date.now() - started,
      !!text,
      text ? undefined : 'INVALID_OUTPUT',
    );
    if (!text) throw new AiError('INVALID_OUTPUT', 'Gemini returned an empty answer.');
    return text;
  }
}
