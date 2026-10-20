import * as Prisma from '@prisma/client';
import * as Shared from '@studywidbuddy/shared';

/** The web app only sees the shared enums, so they must match the database enums exactly. */
describe('shared enums mirror Prisma enums', () => {
  const pairs: [string, Record<string, string>, Record<string, string>][] = [
    ['SkillLevel', Shared.SkillLevel, Prisma.SkillLevel],
    ['SkillSource', Shared.SkillSource, Prisma.SkillSource],
    ['SkillCategory', Shared.SkillCategory, Prisma.SkillCategory],
    ['UserRole', Shared.UserRole, Prisma.UserRole],
    ['Visibility', Shared.Visibility, Prisma.Visibility],
    ['EnrollmentStatus', Shared.EnrollmentStatus, Prisma.EnrollmentStatus],
    ['ProjectStatus', Shared.ProjectStatus, Prisma.ProjectStatus],
    ['ApplicationStatus', Shared.ApplicationStatus, Prisma.ApplicationStatus],
    ['TutorRole', Shared.TutorRole, Prisma.TutorRole],
    ['AssessmentStatus', Shared.AssessmentStatus, Prisma.AssessmentStatus],
    ['ChatAuthorKind', Shared.ChatAuthorKind, Prisma.ChatAuthorKind],
    ['MemoryKind', Shared.MemoryKind, Prisma.MemoryKind],
    ['AgentRunTrigger', Shared.AgentRunTrigger, Prisma.AgentRunTrigger],
    ['AgentRunStatus', Shared.AgentRunStatus, Prisma.AgentRunStatus],
    ['ToolRisk', Shared.ToolRisk, Prisma.ToolRisk],
    ['ToolCallStatus', Shared.ToolCallStatus, Prisma.ToolCallStatus],
    ['MeetingKind', Shared.MeetingKind, Prisma.MeetingKind],
    ['MeetingStatus', Shared.MeetingStatus, Prisma.MeetingStatus],
    ['ParticipantStatus', Shared.ParticipantStatus, Prisma.ParticipantStatus],
    ['PullRequestState', Shared.PullRequestState, Prisma.PullRequestState],
    ['ChecksStatus', Shared.ChecksStatus, Prisma.ChecksStatus],
    ['CodeReviewStatus', Shared.CodeReviewStatus, Prisma.CodeReviewStatus],
    ['CodeReviewVerdict', Shared.CodeReviewVerdict, Prisma.CodeReviewVerdict],
    ['ApplicationOutcomeReason', Shared.ApplicationOutcomeReason, Prisma.ApplicationOutcomeReason],
    ['CvScreeningStatus', Shared.CvScreeningStatus, Prisma.CvScreeningStatus],
  ];

  it.each(pairs)('%s', (_, shared, prisma) => {
    expect(Object.keys(shared).sort()).toEqual(Object.keys(prisma).sort());
  });
});
