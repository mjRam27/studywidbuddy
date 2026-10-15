const PLAYER_ORIGINS = ['https://www.youtube-nocookie.com', 'https://www.youtube.com'];

/**
 * Talks to an embedded YouTube player over its documented postMessage protocol (the one the
 * IFrame Player API uses), so we can read the current time and seek without loading
 * YouTube's script. Needs `enablejsapi=1&origin=…` on the embed URL.
 */
export class YoutubeBridge {
  private readonly onMessage = (e: MessageEvent) => this.receive(e);
  private lastSec = -1;

  constructor(
    private readonly iframe: HTMLIFrameElement,
    private readonly onTime: (sec: number) => void,
  ) {
    window.addEventListener('message', this.onMessage);
  }

  /** Call when the iframe has loaded: asks the player to start sending updates. */
  listen() {
    this.post({ event: 'listening', id: 1, channel: 'widget' });
  }

  seek(sec: number) {
    this.command('seekTo', [Math.max(0, sec), true]);
    this.command('playVideo', []);
  }

  pause() {
    this.command('pauseVideo', []);
  }

  destroy() {
    window.removeEventListener('message', this.onMessage);
  }

  private command(func: string, args: unknown[]) {
    this.post({ event: 'command', func, args, id: 1, channel: 'widget' });
  }

  private post(msg: object) {
    const target = this.iframe.contentWindow;
    if (!target) return;
    const origin = PLAYER_ORIGINS.find((o) => this.iframe.src.startsWith(o));
    if (origin) target.postMessage(JSON.stringify(msg), origin);
  }

  private receive(e: MessageEvent) {
    if (e.source !== this.iframe.contentWindow || !PLAYER_ORIGINS.includes(e.origin)) return;
    let data: { event?: string; info?: { currentTime?: unknown } } | null = null;
    try {
      data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
    } catch {
      return;
    }
    const t = data?.info?.currentTime;
    if (data?.event !== 'infoDelivery' || typeof t !== 'number' || !Number.isFinite(t)) return;
    const sec = Math.floor(t);
    if (sec === this.lastSec) return;
    this.lastSec = sec;
    this.onTime(sec);
  }
}

/** 245 → "4:05", 3723 → "1:02:03". */
export function fmtTime(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
