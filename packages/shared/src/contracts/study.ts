import type { AssessmentStatus, TutorRole } from '../enums';

/** A voice check needs this many finished lessons, so there is something to ask about. */
export const ASSESSMENT_MIN_LESSONS = 2;
export const ASSESSMENT_QUESTION_COUNT = 5;
export const TUTOR_MESSAGE_MAX = 2000;
export const ASSESSMENT_ANSWER_MAX = 4000;
export const NOTE_MAX = 20000;

/** A transcript line: seconds into the video, and what was said. */
export interface TranscriptSegment {
  start: number;
  text: string;
}

/** NONE, or where the transcript came from / its generation state. */
export type TranscriptStatus = 'NONE' | 'PASTED' | 'GEMINI' | 'PENDING' | 'FAILED';

export interface LessonRef {
  id: string;
  /** e.g. "4.3" = module 4, lesson 3. */
  label: string;
  title: string;
}

/** One lesson as the Study Workspace shows it, with the learner's own note. */
export interface StudyLessonView extends LessonRef {
  moduleTitle: string;
  durationSec: number;
  /** YouTube id; the player embeds youtube-nocookie.com. Null when no video is attached yet. */
  youtubeId: string | null;
  /** Attribution shown under the player. */
  video: { title: string; channel: string } | null;
  summary: string | null;
  /** Timestamped transcript, when available; the AI Buddy uses it to follow the video. */
  transcript: TranscriptSegment[] | null;
  /** False when the transcript has no timestamps (one block of text). */
  transcriptTimed: boolean;
  completed: boolean;
  note: { body: string; updatedAt: string } | null;
  previous: LessonRef | null;
  next: LessonRef | null;
}

export interface SaveNoteRequest {
  body: string;
}

export interface TutorMessageView {
  id: string;
  role: TutorRole;
  content: string;
  viaVoice: boolean;
  lessonLabel: string | null;
  /** Video position the question was about. */
  atSec: number | null;
  createdAt: string;
}

export interface TutorAskRequest {
  message: string;
  lessonId?: string;
  /** Asked by voice: the answer is kept short and free of formatting so it reads aloud well. */
  viaVoice?: boolean;
  /** Where the learner is in the lesson video (seconds), so the AI explains that part. */
  atSec?: number;
}

export interface TutorAskResponse {
  question: TutorMessageView;
  answer: TutorMessageView;
}

export interface AssessmentQuestionView {
  position: number;
  focus: string;
  prompt: string;
  lessonLabel: string | null;
  answer: string | null;
  viaVoice: boolean;
  /** 0–10. Only present once evaluated. */
  score: number | null;
  feedback: string | null;
  modelAnswer: string | null;
}

export interface AssessmentSummary {
  id: string;
  status: AssessmentStatus;
  lessonsCovered: number;
  /** 0–100, computed by code from per-question scores. */
  overallScore: number | null;
  createdAt: string;
  evaluatedAt: string | null;
}

export interface AssessmentView extends AssessmentSummary {
  enrollmentId: string;
  course: { slug: string; title: string };
  failureMessage: string | null;
  summary: string | null;
  strengths: string[];
  gaps: string[];
  /** Lesson labels worth revisiting, e.g. ["4.3"]. */
  reviewLessons: string[];
  questions: AssessmentQuestionView[];
}

export interface AnswerAssessmentRequest {
  answer: string;
  viaVoice?: boolean;
}

/** Admin: attach a YouTube video and the text the AI Buddy uses for a lesson. */
export interface LessonContentUpdate {
  /** Any YouTube link or bare id; null removes the video. */
  youtubeUrl?: string | null;
  summary?: string | null;
  transcript?: string | null;
}

export interface LessonContentView {
  id: string;
  label: string;
  title: string;
  youtubeId: string | null;
  videoTitle: string | null;
  videoChannel: string | null;
  summary: string | null;
  hasTranscript: boolean;
  transcriptStatus: TranscriptStatus;
  transcriptSegments: number;
}

export interface CourseContentView {
  course: { id: string; slug: string; title: string };
  /** Transcripts can be generated from the videos (a Gemini key is configured). */
  autoTranscripts: boolean;
  modules: { id: string; position: number; title: string; lessons: LessonContentView[] }[];
}
