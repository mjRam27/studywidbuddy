import type { Env } from '../common/config/env';
import type { AiUsageService } from './ai-usage.service';
import { AiError } from './ai-provider';
import { HttpGeminiChat } from './gemini-chat';

const env = { GEMINI_API_KEY: 'k', GEMINI_MODEL: 'main-model', GEMINI_FALLBACK_MODEL: 'backup-model' } as Env;
const usage = { record: jest.fn() } as unknown as AiUsageService;
const req = { purpose: 'debug.assistant', system: 'sys', turns: [{ role: 'user' as const, text: 'hi' }] };

const reply = (status: number, body: object) => ({ ok: status < 300, status, json: async () => body });
const answer = (text: string) => reply(200, { candidates: [{ content: { parts: [{ text }] } }] });
const busy = () => reply(503, { error: { message: 'This model is currently experiencing high demand.' } });

describe('HttpGeminiChat', () => {
  const realFetch = global.fetch;
  let calls: string[];
  const mockFetch = (...responses: ReturnType<typeof reply>[]) => {
    calls = [];
    global.fetch = jest.fn(async (url: string) => {
      calls.push(String(url).match(/models\/([^:]+)/)![1]);
      return responses.shift()!;
    }) as unknown as typeof fetch;
  };
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('answers on the first try', async () => {
    mockFetch(answer('hello'));
    await expect(new HttpGeminiChat(env, usage).reply(req)).resolves.toBe('hello');
    expect(calls).toEqual(['main-model']);
  });

  it('falls back to the backup model when the main one is busy', async () => {
    mockFetch(busy(), answer('from backup'));
    await expect(new HttpGeminiChat(env, usage).reply(req)).resolves.toBe('from backup');
    expect(calls).toEqual(['main-model', 'backup-model']);
  });

  it('does not retry a request Gemini rejects', async () => {
    mockFetch(reply(400, { error: { message: 'bad request' } }));
    await expect(new HttpGeminiChat(env, usage).reply(req)).rejects.toThrow('bad request');
    expect(calls).toEqual(['main-model']);
  });

  it('gives up with the last error when every model is busy', async () => {
    mockFetch(busy(), busy());
    const err = await new HttpGeminiChat(env, usage).reply(req).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect((err as AiError).kind).toBe('UNAVAILABLE');
  });
});
