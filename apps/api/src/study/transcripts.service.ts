import { InjectQueue } from '@nestjs/bullmq';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode, type TranscriptStatus } from '@studywidbuddy/shared';
import type { Queue } from 'bullmq';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { ASSESSMENT_QUEUE } from '../queue/queue.module';
import { cleanSegments, parseTranscript, type Segment } from './transcript';
import { VideoTranscriber } from './video-transcriber';

export const JOB_LESSON_TRANSCRIBE = 'lesson.transcribe';
export interface TranscribeJob {
  lessonId: string;
}

/** Where a lesson's transcript came from (stored in Lesson.transcriptSource). */
export const SOURCE = { PASTED: 'PASTED', GEMINI: 'GEMINI', PENDING: 'PENDING', FAILED: 'FAILED' } as const;

export function transcriptStatus(source: string | null, hasText: boolean): TranscriptStatus {
  if (source && source in SOURCE) return source as TranscriptStatus;
  return hasText ? 'PASTED' : 'NONE';
}

/** Stored segments, or the plain transcript as one block when it has no timestamps. */
export function lessonSegments(l: { transcriptSegments: Prisma.JsonValue | null; transcript: string | null }) {
  const segs = cleanSegments(l.transcriptSegments);
  return { segments: segs.length ? segs : null, text: l.transcript };
}

/**
 * Lesson transcripts the AI Buddy reads to follow the video: pasted by an admin (e.g. copied
 * from YouTube's "Show transcript" panel) or generated from the video with Gemini.
 */
@Injectable()
export class TranscriptsService {
  private readonly logger = new Logger(TranscriptsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly transcriber: VideoTranscriber,
    @InjectQueue(ASSESSMENT_QUEUE) private readonly queue: Queue<TranscribeJob>,
  ) {}

  get autoAvailable() {
    return this.transcriber.configured;
  }

  /** Data for a pasted transcript: timestamped lines become segments; plain text is kept as is. */
  static pasted(raw: string | null | undefined) {
    if (raw === undefined) return {};
    const text = raw?.trim() ?? '';
    if (!text) return { transcript: null, transcriptSegments: Prisma.DbNull, transcriptSource: null };
    const segments = parseTranscript(text);
    return {
      transcript: segments.length ? segments.map((s) => s.text).join(' ') : text,
      transcriptSegments: segments.length ? (segments as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      transcriptSource: SOURCE.PASTED,
    };
  }

  /** Queues transcript generation for one lesson. */
  async request(lessonId: string): Promise<void> {
    this.assertAvailable();
    const l = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { youtubeId: true } });
    if (!l) throw notFound('Lesson');
    if (!l.youtubeId) {
      throw new DomainError(ErrorCode.VALIDATION_FAILED, 'Attach a YouTube video to this lesson first.');
    }
    await this.enqueue(lessonId);
  }

  /** Queues every lesson of a course that has a video but no transcript yet. Returns how many. */
  async requestCourse(slug: string): Promise<number> {
    this.assertAvailable();
    const course = await this.prisma.course.findUnique({ where: { slug }, select: { id: true } });
    if (!course) throw notFound('Course');
    const lessons = await this.prisma.lesson.findMany({
      where: {
        module: { courseId: course.id },
        youtubeId: { not: null },
        transcript: null,
        OR: [{ transcriptSource: null }, { transcriptSource: SOURCE.FAILED }],
      },
      select: { id: true },
    });
    for (const l of lessons) await this.enqueue(l.id);
    return lessons.length;
  }

  /** Worker: transcribes the lesson's current video and stores the segments. */
  async transcribe(lessonId: string): Promise<void> {
    const l = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { youtubeId: true } });
    if (!l?.youtubeId) return;
    const segments: Segment[] = await this.transcriber.transcribe(l.youtubeId);
    // Only store it if the video wasn't changed (or a transcript pasted) meanwhile.
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, youtubeId: l.youtubeId, transcriptSource: SOURCE.PENDING },
      data: {
        transcript: segments.map((s) => s.text).join(' '),
        transcriptSegments: segments as unknown as Prisma.InputJsonValue,
        transcriptSource: SOURCE.GEMINI,
      },
    });
  }

  async markFailed(lessonId: string, error: unknown): Promise<void> {
    this.logger.warn(`Transcript for lesson ${lessonId} failed: ${String((error as Error)?.message ?? error)}`);
    await this.prisma.lesson.updateMany({
      where: { id: lessonId, transcriptSource: SOURCE.PENDING },
      data: { transcriptSource: SOURCE.FAILED },
    });
  }

  private assertAvailable() {
    if (!this.transcriber.configured) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'Automatic transcripts need GEMINI_API_KEY on the server. You can paste a transcript instead.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  private async enqueue(lessonId: string) {
    await this.prisma.lesson.update({ where: { id: lessonId }, data: { transcriptSource: SOURCE.PENDING } });
    await this.queue.add(
      JOB_LESSON_TRANSCRIBE,
      { lessonId },
      { jobId: `${JOB_LESSON_TRANSCRIBE}-${lessonId}-${Date.now()}` },
    );
  }
}
