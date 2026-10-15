import type { ProjectStatus } from '../enums';
import type { PersonRef } from './teams';

export const TASK_STATUSES = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH';
export type SprintStatus = 'PLANNED' | 'ACTIVE' | 'COMPLETED';
export const STORY_POINTS = [1, 2, 3, 5, 8, 13] as const;

export interface TaskRef {
  id: string;
  key: string; // "TASK-18"
  title: string;
  status: TaskStatus;
  assignee: PersonRef | null;
}

export interface TaskCard {
  id: string;
  key: string;
  number: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  estimate: number;
  position: number;
  role: { id: string; title: string } | null;
  assignee: PersonRef | null;
  sprintId: string | null;
  aiSuggested: boolean;
  dueDate: string | null;
  pullRequestUrl: string | null;
  /** Unfinished tasks this one depends on. Non-empty = blocked. */
  blockedBy: { id: string; key: string }[];
  dependsOnCount: number;
  overdue: boolean;
}

export interface TaskComment {
  id: string;
  author: PersonRef;
  body: string;
  createdAt: string;
}

export interface TaskDetail extends TaskCard {
  description: string;
  acceptanceCriteria: string[];
  branch: string | null;
  dependsOn: TaskRef[];
  blocks: TaskRef[];
  comments: TaskComment[];
  activity: ActivityItem[];
  createdAt: string;
  updatedAt: string;
  /** Statuses this task may move to right now (server-computed). */
  allowedMoves: TaskStatus[];
}

export interface CreateTaskRequest {
  title: string;
  description?: string;
  acceptanceCriteria?: string[];
  priority?: TaskPriority;
  estimate?: number;
  roleId?: string | null;
  assigneeId?: string | null;
  sprintId?: string | null;
  status?: 'BACKLOG' | 'TODO';
  dueDate?: string | null;
}

export type UpdateTaskRequest = Partial<Omit<CreateTaskRequest, 'status'>> & {
  branch?: string | null;
  pullRequestUrl?: string | null;
};

export interface MoveTaskRequest {
  status: TaskStatus;
  /** Insert before this task in the target column; null/absent = end of column. */
  beforeTaskId?: string | null;
}

export type ActorKind = 'USER' | 'AGENT' | 'SYSTEM';

export interface ActivityItem {
  id: string;
  type: string;
  actorKind: ActorKind;
  actor: PersonRef | null;
  task: { id: string; key: string } | null;
  summary: string;
  createdAt: string;
}

export interface SprintView {
  id: string;
  number: number;
  goal: string;
  startsAt: string;
  endsAt: string;
  status: SprintStatus;
  points: { total: number; done: number };
}

export interface MilestoneView {
  id: string;
  position: number;
  title: string;
  dueDate: string | null;
  completedAt: string | null;
}

export interface WorkspaceMember {
  memberId: string;
  user: PersonRef;
  role: { id: string; title: string };
  skills: string[];
  /** Story points assigned and not done. */
  openPoints: number;
  current: TaskRef | null;
}

export interface WorkspaceOverview {
  project: { id: string; slug: string; title: string; category: string; status: ProjectStatus };
  you: { memberId: string | null; isAdmin: boolean };
  activeSprint: SprintView | null;
  sprints: SprintView[];
  milestones: MilestoneView[];
  members: WorkspaceMember[];
  /** Remaining points per day of the active sprint (null for days in the future). */
  burndown: { date: string; remaining: number | null }[];
  counts: Record<TaskStatus, number>;
  blocked: TaskCard[];
  overdue: TaskCard[];
  health: 'ON_TRACK' | 'AT_RISK' | 'OFF_TRACK' | 'NOT_STARTED';
  healthReasons: string[];
}

// ───── AI planning ─────

export interface PlanTaskDraft {
  key: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  roleKey: string | null;
  estimate: number;
  priority: TaskPriority;
  sprintNumber: number;
  dependsOn: string[];
}

export interface PlanDraft {
  milestones: { title: string; dueInDays: number }[];
  sprints: { number: number; goal: string; durationDays: number }[];
  tasks: PlanTaskDraft[];
  rationale: string;
}

export type PlanStatus = 'GENERATING' | 'PROPOSED' | 'APPLIED' | 'DISCARDED' | 'FAILED';

export interface PlanProposalView {
  id: string;
  status: PlanStatus;
  plan: PlanDraft | null;
  failureMessage: string | null;
  createdAt: string;
  decidedAt: string | null;
}
