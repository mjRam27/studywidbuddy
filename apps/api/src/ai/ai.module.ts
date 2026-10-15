import { Controller, Get, Global, Module } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { AiStatus } from '@studywidbuddy/shared';
import { ENV, type Env } from '../common/config/env';
import { AiProvider } from './ai-provider';
import { AiUsageService } from './ai-usage.service';
import { AnthropicProvider } from './anthropic.provider';
import { DisabledAiProvider } from './disabled.provider';

@ApiTags('ai')
@ApiBearerAuth()
@Controller('ai')
class AiStatusController {
  constructor(private readonly ai: AiProvider) {}

  /** Lets the UI explain upfront when AI features are off, instead of failing on click. */
  @Get('status')
  status(): AiStatus {
    return {
      configured: this.ai.isConfigured(),
      provider: this.ai.name,
      model: this.ai.isConfigured() ? this.ai.model : null,
      fastModel: this.ai.isConfigured() ? this.ai.fastModel : null,
    };
  }
}

@Global()
@Module({
  controllers: [AiStatusController],
  providers: [
    AiUsageService,
    {
      provide: AiProvider,
      inject: [ENV, AiUsageService],
      useFactory: (env: Env, usage: AiUsageService): AiProvider =>
        env.AI_PROVIDER === 'anthropic' && env.ANTHROPIC_API_KEY
          ? new AnthropicProvider(env.ANTHROPIC_API_KEY, env.AI_MODEL, env.AI_MODEL_FAST, usage)
          : new DisabledAiProvider(),
    },
  ],
  exports: [AiProvider, AiUsageService],
})
export class AiModule {}
