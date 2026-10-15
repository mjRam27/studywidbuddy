import { Injectable, NgZone, inject, signal, type OnDestroy } from '@angular/core';

/**
 * Browser speech: speech-to-text (Web Speech API, Chrome/Edge/Safari) and text-to-speech
 * (speechSynthesis, all modern browsers). Free and keyless. Where recognition isn't
 * supported (e.g. Firefox), `canListen` is false and screens fall back to typing.
 *
 * Note for users: in Chrome, recognition audio is processed by Google's speech service.
 */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

const ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access is blocked. Allow it in your browser’s site settings, or type instead.',
  'service-not-allowed': 'Speech recognition is turned off in this browser. You can type instead.',
  'audio-capture': 'No microphone was found. Plug one in, or type instead.',
  network: 'Speech recognition needs an internet connection. You can type instead.',
  'language-not-supported': 'Speech recognition doesn’t support your browser language. You can type instead.',
};

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Splits long text so Chrome doesn't cut speech off after ~15 seconds. */
export function speechChunks(text: string, max = 220): string[] {
  const sentences = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/);
  const out: string[] = [];
  for (const s of sentences) {
    const last = out.at(-1);
    if (last && last.length + s.length + 1 <= max) out[out.length - 1] = `${last} ${s}`;
    else if (s.length <= max) out.push(s);
    else for (let i = 0; i < s.length; i += max) out.push(s.slice(i, i + max));
  }
  return out.filter(Boolean);
}

/** Provide per component (`providers: [Speech]`) so each screen owns its mic and voice. */
@Injectable()
export class Speech implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly Ctor = recognitionCtor();
  private rec: Recognition | null = null;
  private wantStop = false;

  readonly canListen = !!this.Ctor;
  readonly canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window;
  readonly listening = signal(false);
  /** Live transcript while listening (final + interim words). */
  readonly heard = signal('');
  readonly speaking = signal(false);
  readonly error = signal<string | null>(null);
  /** When the current listen() first heard speech (for think-time measurements). */
  firstSpeechAt: number | null = null;

  /**
   * Listens until the speaker pauses (`continuous: false`) or until `stop()` is called
   * (`continuous: true`, for longer answers). Resolves with the final transcript.
   * Optional limits for spoken interviews: stop after `silenceMs` without new words once the
   * speaker has started, give up if nothing is said within `startTimeoutMs`, and cap the
   * whole answer at `maxMs`.
   */
  listen(opts: { continuous: boolean; silenceMs?: number; startTimeoutMs?: number; maxMs?: number }): Promise<string> {
    if (!this.Ctor) return Promise.resolve('');
    this.cancelSpeech();
    this.rec?.abort();
    this.error.set(null);
    this.heard.set('');
    this.wantStop = false;
    this.firstSpeechAt = null;
    const startedAt = Date.now();
    let lastWordAt = 0;

    const rec = new this.Ctor();
    rec.lang = navigator.language || 'en-US';
    rec.continuous = opts.continuous;
    rec.interimResults = true;
    let finalText = '';

    return new Promise<string>((resolve) => {
      rec.onresult = (e) =>
        this.zone.run(() => {
          let interim = '';
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += `${r[0].transcript.trim()} `;
            else interim += r[0].transcript;
          }
          this.heard.set(`${finalText}${interim}`.trim());
          lastWordAt = Date.now();
          this.firstSpeechAt ??= lastWordAt;
        });
      rec.onerror = (e) =>
        this.zone.run(() => {
          if (e.error === 'no-speech' || e.error === 'aborted') return;
          this.error.set(ERRORS[e.error] ?? 'Speech recognition stopped unexpectedly. You can type instead.');
        });
      // Limits are checked twice a second; any of them ends the answer like stop() would.
      const limits =
        opts.silenceMs || opts.startTimeoutMs || opts.maxMs
          ? setInterval(() => {
              const now = Date.now();
              const silent = !!opts.silenceMs && lastWordAt > 0 && now - lastWordAt >= opts.silenceMs;
              const noStart = !!opts.startTimeoutMs && lastWordAt === 0 && now - startedAt >= opts.startTimeoutMs;
              const tooLong = !!opts.maxMs && now - startedAt >= opts.maxMs;
              if (silent || noStart || tooLong) this.stop();
            }, 500)
          : undefined;
      rec.onend = () =>
        this.zone.run(() => {
          // Browsers end continuous sessions after a silence; keep going until the user stops.
          if (opts.continuous && !this.wantStop && !this.error() && this.rec === rec) {
            try {
              rec.start();
              return;
            } catch {
              /* fall through and finish */
            }
          }
          if (this.rec === rec) this.rec = null;
          clearInterval(limits);
          this.listening.set(false);
          resolve((finalText || this.heard()).trim());
        });
      try {
        rec.start();
        this.rec = rec;
        this.listening.set(true);
      } catch {
        clearInterval(limits);
        this.error.set('The microphone is busy. Try again in a moment.');
        resolve('');
      }
    });
  }

  /** Finish listening; the pending `listen()` resolves with what was heard. */
  stop() {
    this.wantStop = true;
    this.rec?.stop();
  }

  /** Reads text aloud. Resolves when finished or cancelled. */
  speak(text: string): Promise<void> {
    if (!this.canSpeak || !text.trim()) return Promise.resolve();
    const synth = window.speechSynthesis;
    synth.cancel();
    const lang = navigator.language || 'en-US';
    const voice =
      synth.getVoices().find((v) => v.lang === lang && v.localService) ??
      synth.getVoices().find((v) => v.lang.startsWith(lang.slice(0, 2)));
    const chunks = speechChunks(text);
    this.speaking.set(true);
    return new Promise<void>((resolve) => {
      let left = chunks.length;
      const done = () =>
        this.zone.run(() => {
          if (--left > 0) return;
          this.speaking.set(false);
          resolve();
        });
      for (const c of chunks) {
        const u = new SpeechSynthesisUtterance(c);
        u.lang = lang;
        if (voice) u.voice = voice;
        u.rate = 1.02;
        u.onend = done;
        u.onerror = () => {
          left = 1;
          done();
        };
        synth.speak(u);
      }
    });
  }

  cancelSpeech() {
    if (!this.canSpeak) return;
    window.speechSynthesis.cancel();
    this.speaking.set(false);
  }

  ngOnDestroy() {
    this.wantStop = true;
    this.rec?.abort();
    this.cancelSpeech();
  }
}
