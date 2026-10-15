-- CreateEnum
CREATE TYPE "ChatAuthorKind" AS ENUM ('MEMBER', 'AI', 'SYSTEM');

-- CreateEnum
CREATE TYPE "MemoryKind" AS ENUM ('FACT', 'DECISION', 'RISK', 'MEMBER_NOTE', 'SUMMARY');

-- CreateEnum
CREATE TYPE "AgentRunTrigger" AS ENUM ('MANUAL', 'MEETING_SUMMARY');

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ToolRisk" AS ENUM ('READ', 'WRITE_LOW', 'NEEDS_APPROVAL');

-- CreateEnum
CREATE TYPE "ToolCallStatus" AS ENUM ('PROPOSED', 'APPROVED', 'REJECTED', 'EXECUTED', 'FAILED');

-- CreateEnum
CREATE TYPE "MeetingKind" AS ENUM ('CHECK_IN', 'FINAL_REVIEW');

-- CreateEnum
CREATE TYPE "MeetingStatus" AS ENUM ('PREPARING', 'OPEN', 'SUMMARIZING', 'CLOSED', 'FAILED');

-- CreateEnum
CREATE TYPE "ParticipantStatus" AS ENUM ('PENDING', 'ANSWERED', 'MISSED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ActivityType" ADD VALUE 'MEETING_OPENED';
ALTER TYPE "ActivityType" ADD VALUE 'MEETING_SUMMARIZED';
ALTER TYPE "ActivityType" ADD VALUE 'AGENT_ACTION_APPROVED';
ALTER TYPE "ActivityType" ADD VALUE 'AGENT_ACTION_REJECTED';

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "aiPmEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "meetingIntervalDays" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "authorId" UUID,
    "authorKind" "ChatAuthorKind" NOT NULL DEFAULT 'MEMBER',
    "body" TEXT NOT NULL,
    "refType" TEXT,
    "refId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatReadState" (
    "projectId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatReadState_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateTable
CREATE TABLE "ProjectMemory" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "kind" "MemoryKind" NOT NULL,
    "content" TEXT NOT NULL,
    "subjectUserId" UUID,
    "sourceType" TEXT NOT NULL,
    "sourceId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "trigger" "AgentRunTrigger" NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'QUEUED',
    "goal" TEXT NOT NULL,
    "requestedById" UUID,
    "meetingId" UUID,
    "model" TEXT,
    "summary" TEXT,
    "error" TEXT,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentStep" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentStep_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolCall" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "toolUseId" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "risk" "ToolRisk" NOT NULL,
    "status" "ToolCallStatus" NOT NULL,
    "decidedById" UUID,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentToolResult" (
    "id" UUID NOT NULL,
    "toolCallId" UUID NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentToolResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectMeeting" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" "MeetingKind" NOT NULL,
    "status" "MeetingStatus" NOT NULL DEFAULT 'PREPARING',
    "agenda" TEXT,
    "opensAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "summary" TEXT,
    "highlights" TEXT[],
    "risks" TEXT[],
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summarizedAt" TIMESTAMP(3),

    CONSTRAINT "ProjectMeeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingParticipant" (
    "id" UUID NOT NULL,
    "meetingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "ParticipantStatus" NOT NULL DEFAULT 'PENDING',
    "answeredAt" TIMESTAMP(3),
    "aiNote" TEXT,

    CONSTRAINT "MeetingParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingQuestion" (
    "id" UUID NOT NULL,
    "participantId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT,
    "viaVoice" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),

    CONSTRAINT "MeetingQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatMessage_projectId_createdAt_idx" ON "ChatMessage"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectMemory_projectId_archivedAt_createdAt_idx" ON "ProjectMemory"("projectId", "archivedAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_projectId_createdAt_idx" ON "AgentRun"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentStep_runId_index_key" ON "AgentStep"("runId", "index");

-- CreateIndex
CREATE INDEX "AgentToolCall_runId_idx" ON "AgentToolCall"("runId");

-- CreateIndex
CREATE INDEX "AgentToolCall_status_idx" ON "AgentToolCall"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AgentToolResult_toolCallId_key" ON "AgentToolResult"("toolCallId");

-- CreateIndex
CREATE INDEX "ProjectMeeting_status_closesAt_idx" ON "ProjectMeeting"("status", "closesAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectMeeting_projectId_number_key" ON "ProjectMeeting"("projectId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingParticipant_meetingId_userId_key" ON "MeetingParticipant"("meetingId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingQuestion_participantId_position_key" ON "MeetingQuestion"("participantId", "position");

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatReadState" ADD CONSTRAINT "ChatReadState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMemory" ADD CONSTRAINT "ProjectMemory_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentStep" ADD CONSTRAINT "AgentStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "AgentStep"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolCall" ADD CONSTRAINT "AgentToolCall_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentToolResult" ADD CONSTRAINT "AgentToolResult_toolCallId_fkey" FOREIGN KEY ("toolCallId") REFERENCES "AgentToolCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectMeeting" ADD CONSTRAINT "ProjectMeeting_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "ProjectMeeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingParticipant" ADD CONSTRAINT "MeetingParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingQuestion" ADD CONSTRAINT "MeetingQuestion_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MeetingParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written guards (not expressible in Prisma schema).
-- One meeting in progress per project at a time.
CREATE UNIQUE INDEX "ProjectMeeting_one_open_per_project"
  ON "ProjectMeeting" ("projectId") WHERE "status" IN ('PREPARING', 'OPEN', 'SUMMARIZING');
ALTER TABLE "Project" ADD CONSTRAINT "Project_meeting_interval_range"
  CHECK ("meetingIntervalDays" BETWEEN 1 AND 14);
