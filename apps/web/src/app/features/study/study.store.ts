import { computed, inject, Injectable, signal } from '@angular/core';
import type { AssessmentSummary, CourseDetail, EnrollmentView, StudyLessonView } from '@studywidbuddy/shared';
import { Api } from '../../core/api';
import { type ApiError, toApiError } from '../../core/api-error';

export interface OutlineLesson {
  id: string;
  label: string;
  title: string;
  durationSec: number;
  hasVideo: boolean;
  moduleTitle: string;
  modulePosition: number;
}

/** State for one Study Workspace: the course, the learner's enrollment and the open lesson. */
@Injectable()
export class StudyStore {
  private readonly api = inject(Api);

  readonly course = signal<CourseDetail | null>(null);
  readonly enrollment = signal<EnrollmentView | null>(null);
  readonly lesson = signal<StudyLessonView | null>(null);
  readonly reports = signal<AssessmentSummary[]>([]);
  readonly error = signal<ApiError | null>(null);
  /** The course loaded but the learner isn't enrolled in it. */
  readonly notEnrolled = signal(false);
  readonly lessonLoading = signal(false);
  /** A question for the AI Buddy panel, set by other parts of the workspace. */
  readonly buddyPrompt = signal<string | null>(null);
  /** Where the lesson video is (seconds), once the player reports it; sent with AI Buddy questions. */
  readonly videoSec = signal<number | null>(null);
  /** A request to jump the lesson video to a time (the counter makes repeats distinct). */
  readonly seekRequest = signal<{ sec: number; n: number } | null>(null);

  readonly outline = computed<OutlineLesson[]>(() =>
    (this.course()?.modules ?? []).flatMap((m) =>
      m.lessons.map((l) => ({
        id: l.id,
        label: `${m.position}.${l.position}`,
        title: l.title,
        durationSec: l.durationSec,
        hasVideo: l.hasVideo,
        moduleTitle: m.title,
        modulePosition: m.position,
      })),
    ),
  );
  readonly done = computed(() => new Set(this.enrollment()?.completedLessonIds ?? []));
  readonly doneCount = computed(() => this.done().size);
  readonly isActive = computed(() => this.enrollment()?.status === 'ACTIVE');

  async load(slug: string) {
    this.error.set(null);
    this.notEnrolled.set(false);
    try {
      const c = await this.api.course(slug);
      this.course.set(c);
      if (!c.myEnrollmentId) {
        this.notEnrolled.set(true);
        return;
      }
      const [e, reports] = await Promise.all([
        this.api.enrollment(c.myEnrollmentId),
        this.api.assessments(c.myEnrollmentId),
      ]);
      this.enrollment.set(e);
      this.reports.set(reports);
    } catch (err) {
      this.error.set(toApiError(err));
    }
  }

  /** The lesson to open when none is chosen: the next one, else the first. */
  defaultLessonId(): string | null {
    return this.enrollment()?.nextLesson?.id ?? this.outline()[0]?.id ?? null;
  }

  async openLesson(lessonId: string) {
    const e = this.enrollment();
    if (!e || this.lesson()?.id === lessonId) return;
    this.lessonLoading.set(true);
    this.videoSec.set(null);
    try {
      this.lesson.set(await this.api.studyLesson(e.id, lessonId));
    } catch (err) {
      this.error.set(toApiError(err));
    } finally {
      this.lessonLoading.set(false);
    }
  }

  seek(sec: number) {
    this.seekRequest.set({ sec, n: (this.seekRequest()?.n ?? 0) + 1 });
  }

  async completeLesson(lessonId: string) {
    const e = this.enrollment();
    if (!e) return;
    this.enrollment.set(await this.api.completeLesson(e.id, lessonId));
    const l = this.lesson();
    if (l?.id === lessonId) this.lesson.set({ ...l, completed: true });
  }

  async refreshReports() {
    const e = this.enrollment();
    if (e) this.reports.set(await this.api.assessments(e.id));
  }
}
