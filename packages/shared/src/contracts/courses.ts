import type { EnrollmentStatus, SkillLevel } from '../enums';
import type { SkillRef } from './common';

export interface CourseSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: string;
  level: SkillLevel;
  estimatedHours: number;
  skills: SkillRef[];
  moduleCount: number;
  lessonCount: number;
  activeLearners: number;
}

export interface LessonSummary {
  id: string;
  position: number;
  title: string;
  durationSec: number;
  hasVideo: boolean;
}

export interface ModuleDetail {
  id: string;
  position: number;
  title: string;
  lessons: LessonSummary[];
}

export interface CourseDetail extends CourseSummary {
  description: string;
  outcomes: string[];
  modules: ModuleDetail[];
  /** The caller's active or completed enrollment in this course, if any. */
  myEnrollmentId: string | null;
}

export interface EnrollRequest {
  courseId: string;
  /** The learner's self-assessed level for this course. */
  level: SkillLevel;
}

export interface EnrollmentView {
  id: string;
  status: EnrollmentStatus;
  level: SkillLevel;
  startedAt: string;
  completedAt: string | null;
  /** 0–100, from completed lessons. */
  progress: number;
  completedLessonIds: string[];
  course: { id: string; slug: string; title: string; category: string };
  currentModule: { position: number; title: string } | null;
  /** e.g. label "4.4" = module 4, lesson 4. */
  nextLesson: { id: string; label: string; title: string } | null;
}

export interface MyLearningResponse {
  maxActive: number;
  active: EnrollmentView[];
  completedCount: number;
}

export type LearningActivityKind = 'LESSON_COMPLETED' | 'COURSE_STARTED' | 'COURSE_COMPLETED' | 'COURSE_LEFT';

export interface LearningActivityItem {
  kind: LearningActivityKind;
  at: string;
  courseTitle: string;
  /** Lesson label and title for LESSON_COMPLETED, e.g. "4.3 Providers". */
  detail: string | null;
}

/** Everything here is derived from stored progress; nothing is estimated. */
export interface LearningStats {
  /** Consecutive days (in the user's timezone) with at least one completed lesson, ending today or yesterday. */
  streakDays: number;
  /** Last 35 days, oldest first. `count` = lessons completed that day. */
  days: { date: string; count: number }[];
  thisMonth: { lessonsCompleted: number; minutesLearned: number; coursesCompleted: number; coursesStarted: number };
  recent: LearningActivityItem[];
}

export interface CourseRecommendation {
  course: CourseSummary;
  /** Plain-language reasons, e.g. "Uses Angular, which you know". */
  reasons: string[];
}
