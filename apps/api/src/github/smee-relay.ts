import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { ENV, type Env, githubConfigured } from '../common/config/env';

/**
 * Development only. GitHub can't reach localhost, so webhooks go to a smee.io channel; this
 * relay listens to that channel (server-sent events) and replays each delivery to our own
 * webhook endpoint, headers included, so signature checks still apply.
 * In production GitHub calls the API directly and this never starts.
 */
@Injectable()
export class SmeeRelay implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(SmeeRelay.name);
  private abort: AbortController | null = null;
  private stopped = false;

  constructor(@Inject(ENV) private readonly env: Env) {}

  onApplicationBootstrap() {
    const source = this.env.GITHUB_WEBHOOK_PROXY_URL;
    if (this.env.NODE_ENV !== 'development' || !source || !githubConfigured(this.env)) return;
    void this.run(source, `http://127.0.0.1:${this.env.PORT}/api/v1/github/webhook`);
  }

  onModuleDestroy() {
    this.stopped = true;
    this.abort?.abort();
  }

  private async run(source: string, target: string) {
    let backoff = 1000;
    while (!this.stopped) {
      try {
        this.abort = new AbortController();
        const res = await fetch(source, { headers: { accept: 'text/event-stream' }, signal: this.abort.signal });
        if (!res.ok || !res.body) throw new Error(`smee responded ${res.status}`);
        this.logger.log(`Relaying GitHub webhooks from ${source}`);
        backoff = 1000;
        const decoder = new TextDecoder();
        let buffer = '';
        for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          let i: number;
          while ((i = buffer.indexOf('\n\n')) >= 0) {
            const raw = buffer.slice(0, i);
            buffer = buffer.slice(i + 2);
            await this.forward(raw, target);
          }
        }
      } catch (e) {
        if (this.stopped) return;
        this.logger.warn(`smee relay disconnected (${(e as Error).message}); retrying`);
      }
      await new Promise((r) => setTimeout(r, backoff));
      backoff = Math.min(backoff * 2, 30_000);
    }
  }

  private async forward(raw: string, target: string) {
    const lines = raw.split('\n');
    const event = lines
      .find((l) => l.startsWith('event:'))
      ?.slice(6)
      .trim();
    const data = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trimStart())
      .join('\n');
    if ((event && event !== 'message') || !data) return; // ready / ping
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(data) as Record<string, unknown>;
    } catch {
      return;
    }
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    for (const h of ['x-github-event', 'x-github-delivery', 'x-hub-signature-256', 'user-agent']) {
      if (typeof msg[h] === 'string') headers[h] = msg[h];
    }
    try {
      const res = await fetch(target, { method: 'POST', headers, body: JSON.stringify(msg.body) });
      this.logger.log(`webhook ${headers['x-github-event']} → ${res.status}`);
    } catch (e) {
      this.logger.warn(`Could not forward webhook: ${(e as Error).message}`);
    }
  }
}
