-- CreateEnum
CREATE TYPE "InterviewStatus" AS ENUM ('GENERATING', 'READY', 'SUBMITTED', 'EVALUATED', 'FAILED');

-- CreateEnum
CREATE TYPE "InterviewStage" AS ENUM ('QUESTIONS', 'EVALUATION');

-- CreateEnum
CREATE TYPE "InterviewQuestionKind" AS ENUM ('TECHNICAL', 'PROBLEM_SOLVING', 'COMMUNICATION', 'PROJECT_FIT');

-- CreateTable
CREATE TABLE "InterviewSession" (
    "id" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" "InterviewStatus" NOT NULL DEFAULT 'GENERATING',
    "failedStage" "InterviewStage",
    "failureReason" TEXT,
    "aiModel" TEXT,
    "readyAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewQuestion" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "kind" "InterviewQuestionKind" NOT NULL,
    "focus" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewResponse" (
    "id" UUID NOT NULL,
    "questionId" UUID NOT NULL,
    "answer" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateEvaluation" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "technicalScore" INTEGER NOT NULL,
    "problemSolvingScore" INTEGER NOT NULL,
    "communicationScore" INTEGER NOT NULL,
    "projectFitScore" INTEGER NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "recommendedRoleId" UUID,
    "strengths" TEXT[],
    "areasToImprove" TEXT[],
    "summary" TEXT NOT NULL,
    "aiModel" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiCall" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "errorCode" TEXT,
    "userId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewSession_applicationId_key" ON "InterviewSession"("applicationId");

-- CreateIndex
CREATE INDEX "InterviewSession_status_idx" ON "InterviewSession"("status");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewQuestion_sessionId_position_key" ON "InterviewQuestion"("sessionId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewResponse_questionId_key" ON "InterviewResponse"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateEvaluation_sessionId_key" ON "CandidateEvaluation"("sessionId");

-- CreateIndex
CREATE INDEX "AiCall_purpose_createdAt_idx" ON "AiCall"("purpose", "createdAt");

-- CreateIndex
CREATE INDEX "AiCall_userId_createdAt_idx" ON "AiCall"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "InterviewSession" ADD CONSTRAINT "InterviewSession_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProjectApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewResponse" ADD CONSTRAINT "InterviewResponse_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "InterviewQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "InterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_recommendedRoleId_fkey" FOREIGN KEY ("recommendedRoleId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ── Hand-written: scores are percentages, whatever produced them ──
ALTER TABLE "CandidateEvaluation" ADD CONSTRAINT "CandidateEvaluation_scores_range" CHECK (
  "technicalScore" BETWEEN 0 AND 100 AND "problemSolvingScore" BETWEEN 0 AND 100 AND
  "communicationScore" BETWEEN 0 AND 100 AND "projectFitScore" BETWEEN 0 AND 100 AND
  "overallScore" BETWEEN 0 AND 100
);
ALTER TABLE "InterviewQuestion" ADD CONSTRAINT "InterviewQuestion_position_positive" CHECK ("position" > 0);
