import { HttpStatus, Injectable } from '@nestjs/common';
import { EnrollmentStatus, type Prisma, TutorRole } from '@prisma/client';
import { ErrorCode, parseYoutubeId } from '@studywidbuddy/shared';
import type {
  CourseContentView,
  LessonContentUpdate,
  StudyLessonView,
  TutorAskRequest,
  TutorAskResponse,
  TutorMessageView,
} from '@studywidbuddy/shared';
import { AiProvider } from '../ai/ai-provider';
import { DomainError, notFound } from '../common/errors/domain-error';
import { PrismaService } from '../common/prisma/prisma.service';
import { type CourseContext, tutorSystem } from './study-ai';
import type { Segment } from './transcript';
import { lessonSegments, TranscriptsService, transcriptStatus } from './transcripts.service';
import { VideoMetadata } from './video-metadata';

/** Enough history for follow-ups without paying for the whole thread on every turn. */
const TUTOR_HISTORY = 12;

export interface OwnedEnrollment {
  id: string;
  userId: string;
  courseId: string;
  status: EnrollmentStatus;
  level: string;
}

interface OutlineLesson {
  id: string;
  label: string;
  title: string;
  moduleTitle: string;
  durationSec: number;
  youtubeId: string | null;
  videoTitle: string | null;
  videoChannel: string | null;
  summary: string | null;
  transcript: string | null;
  segments: Segment[] | null;
}

@Injectable()
export class StudyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProvider,
    private readonly videos: VideoMetadata,
    private readonly transcripts: TranscriptsService,
  ) {}

  // ───────── access ─────────

  /** The caller's enrollment. Active and completed learners can study; anyone else gets a 404. */
  async enrollment(userId: string, enrollmentId: string): Promise<OwnedEnrollment> {
    const e = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { id: true, userId: true, courseId: true, status: true, level: true },
    });
    if (!e || e.userId !== userId) throw notFound('Enrollment');
    if (e.status === EnrollmentStatus.DEREGISTERED) {
      throw new DomainError(ErrorCode.ENROLLMENT_NOT_ACTIVE, 'You left this course.', HttpStatus.CONFLICT);
    }
    return e;
  }

  /** Lessons in course order with "module.lesson" labels. */
  async outline(courseId: string): Promise<OutlineLesson[]> {
    const modules = await this.prisma.courseModule.findMany({
      where: { courseId },
      orderBy: { position: 'asc' },
      include: { lessons: { orderBy: { position: 'asc' } } },
    });
    return modules.flatMap((m) =>
      m.lessons.map((l) => ({
        id: l.id,
        label: `${m.position}.${l.position}`,
        title: l.title,
        moduleTitle: m.title,
        durationSec: l.durationSec,
        youtubeId: l.youtubeId,
        videoTitle: l.videoTitle,
        videoChannel: l.videoChannel,
        summary: l.summary,
        transcript: l.transcript,
        segments: lessonSegments(l).segments,
      })),
    );
  }

  /** What the AI sees about the course: outline, summaries, and which lessons are done. */
  async courseContext(e: OwnedEnrollment): Promise<{ context: CourseContext; lessons: OutlineLesson[] }> {
    const [course, lessons, done] = await Promise.all([
      this.prisma.course.findUniqueOrThrow({
        where: { id: e.courseId },
        select: { title: true, summary: true, outcomes: true },
      }),
      this.outline(e.courseId),
      this.completedIds(e.id),
    ]);
    return {
      lessons,
      context: {
        title: course.title,
        summary: course.summary,
        outcomes: course.outcomes,
        level: e.level.toLowerCase(),
        lessons: lessons.map((l) => ({
          label: l.label,
          title: l.title,
          moduleTitle: l.moduleTitle,
          summary: l.summary,
          transcript: l.transcript,
          segments: l.segments,
          videoTitle: l.videoTitle,
          videoChannel: l.videoChannel,
          durationSec: l.durationSec,
          completed: done.has(l.id),
        })),
      },
    };
  }

  async completedIds(enrollmentId: string): Promise<Set<string>> {
    const rows = await this.prisma.lessonProgress.findMany({ where: { enrollmentId }, select: { lessonId: true } });
    return new Set(rows.map((r) => r.lessonId));
  }

  // ───────── lessons & notes ─────────

  async lesson(userId: string, enrollmentId: string, lessonId: string): Promise<StudyLessonView> {
    const e = await this.enrollment(userId, enrollmentId);
    const lessons = await this.outline(e.courseId);
    const i = lessons.findIndex((l) => l.id === lessonId);
    if (i < 0) throw notFound('Lesson');
    const l = lessons[i];
    const [done, note] = await Promise.all([
      this.completedIds(e.id),
      this.prisma.lessonNote.findUnique({ where: { userId_lessonId: { userId, lessonId } } }),
    ]);
    const ref = (x: OutlineLesson | undefined) => (x ? { id: x.id, label: x.label, title: x.title } : null);
    return {
      id: l.id,
      label: l.label,
      title: l.title,
      moduleTitle: l.moduleTitle,
      durationSec: l.durationSec,
      youtubeId: l.youtubeId,
      video: l.youtubeId && l.videoTitle ? { title: l.videoTitle, channel: l.videoChannel ?? '' } : null,
      summary: l.summary,
      transcript: l.segments ?? (l.transcript ? [{ start: 0, text: l.transcript }] : null),
      transcriptTimed: !!l.segments,
      completed: done.has(l.id),
      note: note ? { body: note.body, updatedAt: note.updatedAt.toISOString() } : null,
      previous: ref(lessons[i - 1]),
      next: ref(lessons[i + 1]),
    };
  }

  /** Saves (or clears, when empty) the caller's private note on a lesson of their course. */
  async saveNote(userId: string, enrollmentId: string, lessonId: string, body: string) {
    const e = await this.enrollment(userId, enrollmentId);
    await this.assertLessonInCourse(lessonId, e.courseId);
    if (!body.trim()) {
      await this.prisma.lessonNote.deleteMany({ where: { userId, lessonId } });
      return { body: '', updatedAt: new Date().toISOString() };
    }
    const n = await this.prisma.lessonNote.upsert({
      where: { userId_lessonId: { userId, lessonId } },
      create: { userId, lessonId, body },
      update: { body },
    });
    return { body: n.body, updatedAt: n.updatedAt.toISOString() };
  }

  // ───────── AI Buddy ─────────

  async tutorHistory(userId: string, enrollmentId: string): Promise<TutorMessageView[]> {
    const e = await this.enrollment(userId, enrollmentId);
    const rows = await this.prisma.tutorMessage.findMany({
      where: { enrollmentId: e.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { lesson: { select: { position: true, module: { select: { position: true } } } } },
    });
    return rows.reverse().map((m) => this.toMessage(m));
  }

  /**
   * One tutor turn on the fast model. The question is stored first so it isn't lost if the
   * AI call fails; the answer is stored only when the call succeeds.
   */
  async ask(userId: string, enrollmentId: string, req: TutorAskRequest): Promise<TutorAskResponse> {
    const e = await this.enrollment(userId, enrollmentId);
    if (!this.ai.isConfigured()) {
      throw new DomainError(
        ErrorCode.AI_NOT_CONFIGURED,
        'The AI Buddy isn’t available on this server yet.',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (req.lessonId) await this.assertLessonInCourse(req.lessonId, e.courseId);
    const { context } = await this.courseContext(e);
    const lessonRow = req.lessonId ? (await this.outline(e.courseId)).find((l) => l.id === req.lessonId) : undefined;
    const lessonCtx = lessonRow ? (context.lessons.find((l) => l.label === lessonRow.label) ?? null) : null;
    // A video position only means something for the lesson being watched.
    const atSec = lessonRow?.youtubeId && req.atSec !== undefined ? Math.max(0, Math.floor(req.atSec)) : undefined;
    const note = req.lessonId
      ? await this.prisma.lessonNote.findUnique({ where: { userId_lessonId: { userId, lessonId: req.lessonId } } })
      : null;

    const history = await this.prisma.tutorMessage.findMany({
      where: { enrollmentId: e.id },
      orderBy: { createdAt: 'desc' },
      take: TUTOR_HISTORY,
      select: { role: true, content: true },
    });
    const question = await this.prisma.tutorMessage.create({
      data: {
        enrollmentId: e.id,
        lessonId: req.lessonId ?? null,
        role: TutorRole.USER,
        content: req.message.trim(),
        viaVoice: !!req.viaVoice,
        atSec: atSec ?? null,
      },
      include: { lesson: { select: { position: true, module: { select: { position: true } } } } },
    });

    const messages = alternate([
      ...history.reverse().map((m) => ({
        role: m.role === TutorRole.USER ? ('user' as const) : ('assistant' as const),
        content: m.content,
      })),
      { role: 'user' as const, content: req.message.trim() },
    ]);
    const result = await this.ai.generate({
      purpose: req.viaVoice ? 'tutor.voice' : 'tutor.chat',
      userId,
      tier: 'fast',
      system: tutorSystem(context, lessonCtx, !!req.viaVoice, note?.body, atSec),
      messages,
      maxTokens: req.viaVoice ? 600 : 1500,
    });
    const answer = await this.prisma.tutorMessage.create({
      data: {
        enrollmentId: e.id,
        lessonId: req.lessonId ?? null,
        role: TutorRole.ASSISTANT,
        content: result.value.trim() || 'Sorry, I don’t have an answer for that.',
        viaVoice: !!req.viaVoice,
        atSec: atSec ?? null,
      },
      include: { lesson: { select: { position: true, module: { select: { position: true } } } } },
    });
    return { question: this.toMessage(question), answer: this.toMessage(answer) };
  }

  // ───────── admin: lesson content ─────────

  async courseContent(slug: string): Promise<CourseContentView> {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      select: {
        id: true,
        slug: true,
        title: true,
        modules: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            position: true,
            title: true,
            lessons: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                position: true,
                title: true,
                youtubeId: true,
                videoTitle: true,
                videoChannel: true,
                summary: true,
                transcript: true,
                transcriptSegments: true,
                transcriptSource: true,
              },
            },
          },
        },
      },
    });
    if (!course) throw notFound('Course');
    return {
      course: { id: course.id, slug: course.slug, title: course.title },
      autoTranscripts: this.transcripts.autoAvailable,
      modules: course.modules.map((m) => ({
        id: m.id,
        position: m.position,
        title: m.title,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          label: `${m.position}.${l.position}`,
          title: l.title,
          youtubeId: l.youtubeId,
          videoTitle: l.videoTitle,
          videoChannel: l.videoChannel,
          summary: l.summary,
          hasTranscript: !!l.transcript,
          transcriptStatus: transcriptStatus(l.transcriptSource, !!l.transcript),
          transcriptSegments: lessonSegments(l).segments?.length ?? 0,
        })),
      })),
    };
  }

  async updateLessonContent(lessonId: string, dto: LessonContentUpdate) {
    const exists = await this.prisma.lesson.findUnique({ where: { id: lessonId }, select: { youtubeId: true } });
    if (!exists) throw notFound('Lesson');
    let youtubeId: string | null | undefined;
    if (dto.youtubeUrl !== undefined) {
      youtubeId = dto.youtubeUrl === null || dto.youtubeUrl.trim() === '' ? null : parseYoutubeId(dto.youtubeUrl);
      if (youtubeId === null && dto.youtubeUrl && dto.youtubeUrl.trim() !== '') {
        throw new DomainError(
          ErrorCode.INVALID_VIDEO_URL,
          'That isn’t a YouTube video link. Paste a youtube.com or youtu.be link.',
        );
      }
    }
    // Check with YouTube before attaching: the video must exist and allow embedding.
    let attribution: { videoTitle: string | null; videoChannel: string | null } | undefined;
    if (youtubeId) {
      const found = await this.videos.lookup(youtubeId);
      if (found.status === 'NOT_FOUND') {
        throw new DomainError(ErrorCode.INVALID_VIDEO_URL, 'That video doesn’t exist or is private on YouTube.');
      }
      if (found.status === 'NOT_EMBEDDABLE') {
        throw new DomainError(
          ErrorCode.INVALID_VIDEO_URL,
          'The owner of that video doesn’t allow it to be played on other sites. Choose another video.',
        );
      }
      // UNKNOWN (YouTube unreachable): accept the id, without attribution until it's saved again.
      attribution =
        found.status === 'OK'
          ? { videoTitle: found.title || null, videoChannel: found.channel || null }
          : { videoTitle: null, videoChannel: null };
    } else if (youtubeId === null) {
      attribution = { videoTitle: null, videoChannel: null };
    }
    const blank = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);
    // A different video makes the old transcript wrong; drop it unless a new one comes with it.
    const videoChanged = youtubeId !== undefined && youtubeId !== exists.youtubeId;
    const transcript: Prisma.LessonUpdateInput =
      dto.transcript === undefined && videoChanged
        ? TranscriptsService.pasted(null)
        : TranscriptsService.pasted(dto.transcript);
    await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { youtubeId, ...attribution, summary: blank(dto.summary), ...transcript },
    });
  }

  // ───────── helpers ─────────

  private async assertLessonInCourse(lessonId: string, courseId: string) {
    const l = await this.prisma.lesson.findFirst({
      where: { id: lessonId, module: { courseId } },
      select: { id: true },
    });
    if (!l) throw notFound('Lesson');
  }

  private toMessage(m: {
    id: string;
    role: TutorRole;
    content: string;
    viaVoice: boolean;
    atSec: number | null;
    createdAt: Date;
    lesson: { position: number; module: { position: number } } | null;
  }): TutorMessageView {
    return {
      id: m.id,
      role: m.role,
      content: m.content,
      viaVoice: m.viaVoice,
      lessonLabel: m.lesson ? `${m.lesson.module.position}.${m.lesson.position}` : null,
      atSec: m.atSec,
      createdAt: m.createdAt.toISOString(),
    };
  }
}

/**
 * The model needs user/assistant turns to alternate and start with the user. A failed call
 * can leave two user turns in a row; merge them instead of sending an invalid history.
 */
export function alternate(msgs: { role: 'user' | 'assistant'; content: string }[]) {
  const out: { role: 'user' | 'assistant'; content: string }[] = [];
  for (const m of msgs) {
    const last = out.at(-1);
    if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
    else out.push({ ...m });
  }
  while (out[0]?.role === 'assistant') out.shift();
  return out;
}
