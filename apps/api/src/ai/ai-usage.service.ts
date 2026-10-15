import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import type { AiErrorKind, AiRequest, AiUsage } from './ai-provider';

/** Records one row per LLM call (tokens, duration, outcome). Never stores prompts or outputs. */
@Injectable()
export class AiUsageService {
  private readonly logger = new Logger(AiUsageService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    req: Pick<AiRequest, 'purpose' | 'userId'>,
    provider: string,
    model: string,
    usage: AiUsage | null,
    durationMs: number,
    success: boolean,
    errorCode?: AiErrorKind,
  ) {
    try {
      await this.prisma.aiCall.create({
        data: {
          purpose: req.purpose,
          provider,
          model,
          inputTokens: usage?.inputTokens ?? 0,
          outputTokens: usage?.outputTokens ?? 0,
          durationMs,
          success,
          errorCode,
          userId: req.userId,
        },
      });
    } catch (e) {
      // Usage logging must never break the feature it measures.
      this.logger.warn(`Could not record AI usage: ${(e as Error).message}`);
    }
  }
}
