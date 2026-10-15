-- CreateEnum
CREATE TYPE "ApplicationOutcomeReason" AS ENUM ('CV_BELOW_THRESHOLD', 'INTERVIEW_BELOW_THRESHOLD', 'ROLE_FILLED');

-- CreateEnum
CREATE TYPE "CvScreeningStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InterviewQuestionKind" ADD VALUE 'INTRODUCTION';
ALTER TYPE "InterviewQuestionKind" ADD VALUE 'FOLLOW_UP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InterviewStatus" ADD VALUE 'AWAITING_SCHEDULE';
ALTER TYPE "InterviewStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "InterviewStatus" ADD VALUE 'LIVE';

-- AlterTable
ALTER TABLE "InterviewResponse" ADD COLUMN     "speakMs" INTEGER,
ADD COLUMN     "thinkMs" INTEGER,
ADD COLUMN     "viaVoice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "InterviewSession" ADD COLUMN     "closingRemark" TEXT,
ADD COLUMN     "focusLost" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "plan" JSONB,
ADD COLUMN     "scheduledFor" TIMESTAMP(3),
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "ProjectApplication" ADD COLUMN     "outcomeFeedback" TEXT,
ADD COLUMN     "outcomeReason" "ApplicationOutcomeReason";

-- CreateTable
CREATE TABLE "ApplicationCv" (
    "applicationId" UUID NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationCv_pkey" PRIMARY KEY ("applicationId")
);

-- CreateTable
CREATE TABLE "CvScreening" (
    "applicationId" UUID NOT NULL,
    "status" "CvScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "atsScore" INTEGER,
    "skillsScore" INTEGER,
    "experienceScore" INTEGER,
    "keywordsScore" INTEGER,
    "projectsScore" INTEGER,
    "clarityScore" INTEGER,
    "matchedSkills" TEXT[],
    "missingSkills" TEXT[],
    "candidateSummary" TEXT,
    "feedback" TEXT,
    "failureReason" TEXT,
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "CvScreening_pkey" PRIMARY KEY ("applicationId")
);

-- CreateIndex
CREATE INDEX "ProjectApplication_roleId_status_idx" ON "ProjectApplication"("roleId", "status");

-- AddForeignKey
ALTER TABLE "ApplicationCv" ADD CONSTRAINT "ApplicationCv_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProjectApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CvScreening" ADD CONSTRAINT "CvScreening_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProjectApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written guards.
ALTER TABLE "CvScreening" ADD CONSTRAINT "CvScreening_scores_range" CHECK (
  ("atsScore" IS NULL OR "atsScore" BETWEEN 0 AND 100) AND
  ("skillsScore" IS NULL OR "skillsScore" BETWEEN 0 AND 100) AND
  ("experienceScore" IS NULL OR "experienceScore" BETWEEN 0 AND 100) AND
  ("keywordsScore" IS NULL OR "keywordsScore" BETWEEN 0 AND 100) AND
  ("projectsScore" IS NULL OR "projectsScore" BETWEEN 0 AND 100) AND
  ("clarityScore" IS NULL OR "clarityScore" BETWEEN 0 AND 100)
);
ALTER TABLE "ApplicationCv" ADD CONSTRAINT "ApplicationCv_size" CHECK ("sizeBytes" > 0 AND "sizeBytes" <= 5242880);
