import { AiError } from '../../src/ai/ai-provider';
import { type ChatRequest, GeminiChat } from '../../src/ai/gemini-chat';

/** TEST ONLY. Records every request and answers with a fixed reply. */
export class FakeGeminiChat extends GeminiChat {
  configured = true;
  failNext = false;
  readonly requests: ChatRequest[] = [];

  async reply(req: ChatRequest): Promise<string> {
    this.requests.push(req);
    if (this.failNext) {
      this.failNext = false;
      throw new AiError('UNAVAILABLE', 'busy');
    }
    return 'Look at the loop condition in cartTotal. What is the last index of an array?';
  }
}
