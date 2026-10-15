import { Injectable, Logger } from '@nestjs/common';

export type VideoLookup =
  | { status: 'OK'; title: string; channel: string }
  /** Deleted, private, or never existed. */
  | { status: 'NOT_FOUND' }
  /** The owner disabled embedding, so it can't play on our site. */
  | { status: 'NOT_EMBEDDABLE' }
  /** YouTube couldn't be reached; the caller decides whether to accept the id anyway. */
  | { status: 'UNKNOWN' };

/** Looks up a YouTube video before it is attached to a lesson. Tests replace this class. */
export abstract class VideoMetadata {
  abstract lookup(youtubeId: string): Promise<VideoLookup>;
}

/**
 * YouTube's public oEmbed endpoint: no API key, and it answers exactly the questions we
 * need (does the video exist, may it be embedded, what is it called, who made it).
 */
@Injectable()
export class YoutubeOEmbed extends VideoMetadata {
  private readonly logger = new Logger(YoutubeOEmbed.name);

  async lookup(youtubeId: string): Promise<VideoLookup> {
    const url = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${youtubeId}`,
    )}`;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (res.status === 401 || res.status === 403) return { status: 'NOT_EMBEDDABLE' };
      if (res.status === 400 || res.status === 404) return { status: 'NOT_FOUND' };
      if (!res.ok) return { status: 'UNKNOWN' };
      const body = (await res.json()) as { title?: string; author_name?: string };
      return {
        status: 'OK',
        title: (body.title ?? '').slice(0, 300),
        channel: (body.author_name ?? '').slice(0, 120),
      };
    } catch (e) {
      this.logger.warn(`YouTube lookup failed for ${youtubeId}: ${(e as Error).message}`);
      return { status: 'UNKNOWN' };
    }
  }
}
