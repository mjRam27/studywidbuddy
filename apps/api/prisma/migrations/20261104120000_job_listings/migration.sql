-- CreateEnum
CREATE TYPE "JobSource" AS ENUM ('ARBEITNOW', 'REMOTIVE', 'ADZUNA');

-- CreateTable
CREATE TABLE "JobPosting" (
    "id" UUID NOT NULL,
    "source" "JobSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "remote" BOOLEAN NOT NULL DEFAULT false,
    "employment" TEXT,
    "description" TEXT NOT NULL,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "postedAt" TIMESTAMP(3) NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSkill" (
    "jobId" UUID NOT NULL,
    "skillId" UUID NOT NULL,

    CONSTRAINT "JobSkill_pkey" PRIMARY KEY ("jobId","skillId")
);

-- CreateIndex
CREATE INDEX "JobPosting_dedupeKey_idx" ON "JobPosting"("dedupeKey");

-- CreateIndex
CREATE INDEX "JobPosting_active_postedAt_idx" ON "JobPosting"("active", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_source_externalId_key" ON "JobPosting"("source", "externalId");

-- CreateIndex
CREATE INDEX "JobSkill_skillId_idx" ON "JobSkill"("skillId");

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobPosting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobSkill" ADD CONSTRAINT "JobSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

