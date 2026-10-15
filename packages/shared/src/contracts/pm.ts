import type {
  AgentRunStatus,
  AgentRunTrigger,
  MeetingKind,
  MeetingStatus,
  MemoryKind,
  ParticipantStatus,
  ToolCallStatus,
  ToolRisk,
} from '../enums';
import type { PersonRef } from './teams';

export const MEETING_ANSWER_MAX = 4000;
export const AGENT_GOAL_MAX = 500;

// ───────── Memory ─────────

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  subject: PersonRef | null;
  sourceType: string;
  sourceId: string | null;
  createdAt: string;
}

// ───────── Agent runs ─────────

export interface AgentToolCallView {
  id: string;
  tool: string;
  /** Human-readable one-liner, e.g. "Create task “Add retry to webhook” for Sarah". */
  label: string;
  input: unknown;
  risk: ToolRisk;
  status: ToolCallStatus;
  result: { ok: boolean; output: unknown } | null;
  decidedBy: PersonRef | null;
  decidedAt: string | null;
  createdAt: string;
}

export interface AgentStepView {
  index: number;
  text: string | null;
  toolCalls: AgentToolCallView[];
}

export interface AgentRunSummary {
  id: string;
  trigger: AgentRunTrigger;
  status: AgentRunStatus;
  goal: string;
  summary: string | null;
  error: string | null;
  requestedBy: PersonRef | null;
  meetingId: string | null;
  pendingApprovals: number;
  createdAt: string;
  finishedAt: string | null;
}

export interface AgentRunView extends AgentRunSummary {
  model: string | null;
  steps: AgentStepView[];
}

export interface StartAgentRunRequest {
  /** What to look at, e.g. "Review the sprint and rebalance work". Optional. */
  goal?: string;
}

/** A proposed action waiting for a team member's approval. */
export interface PendingApproval extends AgentToolCallView {
  runId: string;
  runGoal: string;
}

// ───────── Meetings ─────────

export interface MeetingQuestionView {
  position: number;
  prompt: string;
  answer: string | null;
  viaVoice: boolean;
}

export interface MeetingParticipantView {
  user: PersonRef;
  status: ParticipantStatus;
  answeredAt: string | null;
  /** The AI PM's note on this person's update (after the summary). */
  aiNote: string | null;
  /** Questions and answers. Teammates see each other's answers once the meeting is summarized. */
  questions: MeetingQuestionView[] | null;
}

export interface MeetingSummary {
  id: string;
  number: number;
  kind: MeetingKind;
  status: MeetingStatus;
  opensAt: string;
  closesAt: string;
  answered: number;
  participants: number;
  /** Has the caller still got questions to answer? */
  myStatus: ParticipantStatus | null;
}

export interface MeetingView extends MeetingSummary {
  project: { slug: string; title: string };
  agenda: string | null;
  summary: string | null;
  highlights: string[];
  risks: string[];
  failureMessage: string | null;
  people: MeetingParticipantView[];
}

export interface AnswerMeetingRequest {
  answer: string;
  viaVoice?: boolean;
}

/** AI PM tab: everything at once. */
export interface PmOverview {
  enabled: boolean;
  aiConfigured: boolean;
  meetingIntervalDays: number;
  nextCheckInAt: string | null;
  openMeeting: MeetingSummary | null;
  meetings: MeetingSummary[];
  runs: AgentRunSummary[];
  approvals: PendingApproval[];
  memory: MemoryItem[];
}

export interface UpdatePmSettingsRequest {
  enabled?: boolean;
  meetingIntervalDays?: number;
}
