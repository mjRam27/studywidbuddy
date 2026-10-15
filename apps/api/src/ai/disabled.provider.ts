import { AiError, AiProvider, type AiResult, type AiToolResult } from './ai-provider';

/**
 * Used when AI_PROVIDER=none. Every call fails with NOT_CONFIGURED so the UI can say
 * "AI isn't available" instead of showing invented output.
 */
export class DisabledAiProvider extends AiProvider {
  readonly name = 'none';
  readonly model = 'none';
  readonly fastModel = 'none';

  isConfigured() {
    return false;
  }

  private fail(): never {
    throw new AiError('NOT_CONFIGURED', 'AI features are not configured on this server.');
  }

  generate(): Promise<AiResult<string>> {
    this.fail();
  }
  generateStructured<T>(): Promise<AiResult<T>> {
    this.fail();
  }
  // eslint-disable-next-line require-yield
  async *stream(): AsyncIterable<string> {
    this.fail();
  }
  toolCall(): Promise<AiToolResult> {
    this.fail();
  }
}
