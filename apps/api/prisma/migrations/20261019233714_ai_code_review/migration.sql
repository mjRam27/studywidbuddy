-- CreateEnum
CREATE TYPE "CodeReviewStatus" AS ENUM ('QUEUED', 'RUNNING', 'POSTED', 'SKIPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "CodeReviewVerdict" AS ENUM ('LOOKS_GOOD', 'CHANGES_SUGGESTED');

-- CreateTable
CREATE TABLE "CodeReview" (
    "id" UUID NOT NULL,
    "pullRequestId" UUID NOT NULL,
    "headSha" TEXT NOT NULL,
    "status" "CodeReviewStatus" NOT NULL DEFAULT 'QUEUED',
    "verdict" "CodeReviewVerdict",
    "summary" TEXT,
    "findings" JSONB,
    "filesReviewed" INTEGER NOT NULL DEFAULT 0,
    "filesSkipped" INTEGER NOT NULL DEFAULT 0,
    "skippedReason" TEXT,
    "failureReason" TEXT,
    "githubReviewId" BIGINT,
    "githubUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "CodeReview_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CodeReview_pullRequestId_headSha_key" ON "CodeReview"("pullRequestId", "headSha");

-- AddForeignKey
ALTER TABLE "CodeReview" ADD CONSTRAINT "CodeReview_pullRequestId_fkey" FOREIGN KEY ("pullRequestId") REFERENCES "PullRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
