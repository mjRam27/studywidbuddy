/**
 * Domain enums shared by API and web. Values match the Prisma enums one-to-one;
 * the API has a unit test asserting that.
 */
const values = <T extends string>(...v: T[]) =>
  Object.freeze(Object.fromEntries(v.map((x) => [x, x])) as { [K in T]: K });

export const MAX_ACTIVE_COURSES = 4;

export const SkillLevel = values('BEGINNER', 'INTERMEDIATE', 'ADVANCED');
export type SkillLevel = keyof typeof SkillLevel;

export const SkillSource = values('CLAIMED', 'DEMONSTRATED');
export type SkillSource = keyof typeof SkillSource;

export const SkillCategory = values(
  'LANGUAGE',
  'FRONTEND',
  'BACKEND',
  'DATABASE',
  'CLOUD_DEVOPS',
  'DATA_AI',
  'ARCHITECTURE',
  'SPOKEN_LANGUAGE',
  'OTHER',
);
export type SkillCategory = keyof typeof SkillCategory;

export const UserRole = values('USER', 'ADMIN');
export type UserRole = keyof typeof UserRole;

export const Visibility = values('PUBLIC', 'CONNECTIONS', 'PRIVATE');
export type Visibility = keyof typeof Visibility;

export const EnrollmentStatus = values('ACTIVE', 'COMPLETED', 'DEREGISTERED');
export type EnrollmentStatus = keyof typeof EnrollmentStatus;

export const ProjectStatus = values('DRAFT', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED');
export type ProjectStatus = keyof typeof ProjectStatus;

export const ApplicationStatus = values(
  'SUBMITTED',
  'INTERVIEW_PENDING',
  'INTERVIEW_IN_PROGRESS',
  'UNDER_REVIEW',
  'SELECTED',
  'REJECTED',
  'WITHDRAWN',
);
export type ApplicationStatus = keyof typeof ApplicationStatus;

export const TutorRole = values('USER', 'ASSISTANT');
export type TutorRole = keyof typeof TutorRole;

export const AssessmentStatus = values('GENERATING', 'READY', 'EVALUATING', 'EVALUATED', 'FAILED');
export type AssessmentStatus = keyof typeof AssessmentStatus;

export const ChatAuthorKind = values('MEMBER', 'AI', 'SYSTEM');
export type ChatAuthorKind = keyof typeof ChatAuthorKind;

export const MemoryKind = values('FACT', 'DECISION', 'RISK', 'MEMBER_NOTE', 'SUMMARY');
export type MemoryKind = keyof typeof MemoryKind;

export const AgentRunTrigger = values('MANUAL', 'MEETING_SUMMARY');
export type AgentRunTrigger = keyof typeof AgentRunTrigger;

export const AgentRunStatus = values('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
export type AgentRunStatus = keyof typeof AgentRunStatus;

export const ToolRisk = values('READ', 'WRITE_LOW', 'NEEDS_APPROVAL');
export type ToolRisk = keyof typeof ToolRisk;

export const ToolCallStatus = values('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');
export type ToolCallStatus = keyof typeof ToolCallStatus;

export const MeetingKind = values('CHECK_IN', 'FINAL_REVIEW');
export type MeetingKind = keyof typeof MeetingKind;

export const MeetingStatus = values('PREPARING', 'OPEN', 'SUMMARIZING', 'CLOSED', 'FAILED');
export type MeetingStatus = keyof typeof MeetingStatus;

export const ParticipantStatus = values('PENDING', 'ANSWERED', 'MISSED');
export type ParticipantStatus = keyof typeof ParticipantStatus;

export const PullRequestState = values('OPEN', 'CLOSED', 'MERGED');
export type PullRequestState = keyof typeof PullRequestState;

export const ChecksStatus = values('NONE', 'PENDING', 'SUCCESS', 'FAILURE');
export type ChecksStatus = keyof typeof ChecksStatus;

export const CodeReviewStatus = values('QUEUED', 'RUNNING', 'POSTED', 'SKIPPED', 'FAILED');
export type CodeReviewStatus = keyof typeof CodeReviewStatus;

export const CodeReviewVerdict = values('LOOKS_GOOD', 'CHANGES_SUGGESTED');
export type CodeReviewVerdict = keyof typeof CodeReviewVerdict;

export const ApplicationOutcomeReason = values('CV_BELOW_THRESHOLD', 'INTERVIEW_BELOW_THRESHOLD', 'ROLE_FILLED');
export type ApplicationOutcomeReason = keyof typeof ApplicationOutcomeReason;

export const CvScreeningStatus = values('PENDING', 'DONE', 'FAILED');
export type CvScreeningStatus = keyof typeof CvScreeningStatus;

export const LEVEL_LABEL: Record<SkillLevel, string> = {
  BEGINNER: 'Beginner',
  INTERMEDIATE: 'Intermediate',
  ADVANCED: 'Advanced',
};
