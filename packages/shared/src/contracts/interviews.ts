import type { SkillLevel } from '../enums';

export interface AiStatus {
  configured: boolean;
  provider: string;
  model: string | null;
  /** Cheaper model used for tutoring chat and summaries. */
  fastModel: string | null;
}

export type InterviewStatus =
  'GENERATING' | 'READY' | 'AWAITING_SCHEDULE' | 'SCHEDULED' | 'LIVE' | 'SUBMITTED' | 'EVALUATED' | 'FAILED';
export type InterviewQuestionKind =
  'INTRODUCTION' | 'TECHNICAL' | 'PROBLEM_SOLVING' | 'COMMUNICATION' | 'PROJECT_FIT' | 'FOLLOW_UP';

/** ATS thresholds: CV ≥ 80 earns an interview; interview ≥ 60 earns a seat. */
export const CV_PASS_SCORE = 80;
export const INTERVIEW_PASS_SCORE = 60;
export const CV_MAX_BYTES = 5 * 1024 * 1024;
/** Entry-level (BEGINNER) projects skip CV matching: apply, then go straight to the voice interview. */
export const cvRequiredFor = (difficulty: string) => difficulty !== 'BEGINNER';
/** Interviews can be booked from now up to this many days ahead. */
export const INTERVIEW_BOOKING_DAYS = 5;
/** A booked interview can be joined from 10 minutes before until 3 hours after its slot. */
export const INTERVIEW_JOIN_EARLY_MIN = 10;
export const INTERVIEW_JOIN_LATE_MIN = 180;
/** Voice answers: the candidate must start speaking within this time, and may speak this long. */
export const ANSWER_START_LIMIT_SEC = 45;
export const ANSWER_MAX_SEC = 180;
export const INTERVIEW_ANSWER_MAX = 5000;

/** One exchange of the conversation: what the interviewer said and what the candidate answered. */
export interface InterviewTurnView {
  position: number;
  kind: InterviewQuestionKind;
  focus: string;
  /** What the interviewer said (read aloud). */
  prompt: string;
  /** The candidate's spoken answer (speech-to-text), once given. */
  answer: string | null;
}

/** Written feedback the candidate sees after evaluation. */
export interface EvaluationView {
  technicalScore: number;
  problemSolvingScore: number;
  communicationScore: number;
  projectFitScore: number;
  overallScore: number;
  recommendedRole: { id: string; title: string } | null;
  strengths: string[];
  areasToImprove: string[];
  summary: string;
  createdAt: string;
}

export interface InterviewView {
  id: string;
  applicationId: string;
  status: InterviewStatus;
  /** Plain-language reason when status is FAILED. */
  failureMessage: string | null;
  project: { slug: string; title: string; difficulty: SkillLevel };
  role: { id: string; title: string };
  scheduledFor: string | null;
  /** Server-computed: may the candidate join the call right now? */
  canJoin: boolean;
  /** The conversation so far, oldest first. */
  turns: InterviewTurnView[];
  /** What the interviewer is waiting for an answer to (to re-read after a reload). */
  current: InterviewTurnView | null;
  closingRemark: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  /** Present only once status is EVALUATED. */
  evaluation: EvaluationView | null;
  /** Admins only: how the candidate behaved during the call. */
  integrity: { focusLost: number; avgThinkSec: number | null; answers: number } | null;
}

export interface InterviewSlots {
  /** "Start now" is always offered while the interview is unscheduled or rescheduling. */
  now: boolean;
  /** ISO start times over the next days, on the hour, in the candidate's timezone. */
  slots: string[];
  timezone: string;
}

export interface ScheduleInterviewRequest {
  /** 'now' or one of the ISO times from /slots. */
  at: string;
}

export interface InterviewTurnRequest {
  /** Position of the question being answered (guards against double sends). */
  position: number;
  /** The candidate's spoken answer, from speech recognition. */
  answer: string;
  thinkMs?: number;
  speakMs?: number;
  /** Tab switches since the previous turn. */
  focusLost?: number;
}

/** The interviewer's next words. `done` means the call is over and evaluation has started. */
export interface InterviewTurnResponse {
  next: InterviewTurnView | null;
  closingRemark: string | null;
  done: boolean;
}
