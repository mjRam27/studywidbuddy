import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV, type Env } from '../common/config/env';
import { cleanSegments, type Segment } from './transcript';

/**
 * Produces a timestamped transcript for a lesson video so the AI Buddy can follow it.
 * Tests replace this class; nothing in the test suite calls an external service.
 */
export abstract class VideoTranscriber {
  abstract readonly configured: boolean;
  abstract transcribe(youtubeId: string): Promise<Segment[]>;
}

export class TranscriptionError extends Error {}

/**
 * Google's Gemini API accepts a public YouTube URL as input (an official, documented
 * feature), so it can return a timestamped transcript of what is said in the lesson.
 * Needs GEMINI_API_KEY. Each lesson is transcribed once and stored.
 */
@Injectable()
export class GeminiTranscriber extends VideoTranscriber {
  private readonly logger = new Logger(GeminiTranscriber.name);

  constructor(@Inject(ENV) private readonly env: Env) {
    super();
  }

  get configured() {
    return !!this.env.GEMINI_API_KEY;
  }

  async transcribe(youtubeId: string): Promise<Segment[]> {
    if (!this.env.GEMINI_API_KEY) throw new TranscriptionError('GEMINI_API_KEY is not set.');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      this.env.GEMINI_MODEL,
    )}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.env.GEMINI_API_KEY },
      signal: AbortSignal.timeout(300_000),
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { file_data: { file_uri: `https://www.youtube.com/watch?v=${youtubeId}` } },
              {
                text:
                  'Transcribe what is said in this video, in the language spoken. Return one entry roughly every ' +
                  '15–30 seconds of speech: "start" is the time in seconds when that part begins, "text" is what is ' +
                  'said, close to verbatim. Briefly mention important on-screen code or diagrams in square brackets ' +
                  'when the speaker refers to them. Do not add anything that is not in the video.',
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { start: { type: 'NUMBER' }, text: { type: 'STRING' } },
              required: ['start', 'text'],
            },
          },
          maxOutputTokens: 60000,
          temperature: 0,
        },
      }),
    });
    const body = (await res.json().catch(() => null)) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
      error?: { message?: string };
    } | null;
    if (!res.ok) {
      const msg = body?.error?.message ?? `HTTP ${res.status}`;
      this.logger.warn(`Gemini transcription of ${youtubeId} failed: ${msg}`);
      throw new TranscriptionError(msg);
    }
    const text = body?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TranscriptionError('The transcript came back in an unexpected format.');
    }
    const segments = cleanSegments(parsed);
    if (!segments.length) throw new TranscriptionError('No speech was found in this video.');
    return segments;
  }
}
