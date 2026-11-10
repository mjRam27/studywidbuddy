-- CreateTable
CREATE TABLE "DebugAttempt" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "exerciseSlug" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "solvedAt" TIMESTAMP(3),
    "durationSec" INTEGER,
    "runs" INTEGER NOT NULL DEFAULT 0,
    "assistantTurns" INTEGER NOT NULL DEFAULT 0,
    "solutionViewed" BOOLEAN NOT NULL DEFAULT false,
    "solvedFiles" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebugAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudyTime" (
    "userId" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "day" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL DEFAULT 0,
    "lastBeatAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudyTime_pkey" PRIMARY KEY ("userId","enrollmentId","day")
);

-- CreateIndex
CREATE INDEX "DebugAttempt_userId_solvedAt_idx" ON "DebugAttempt"("userId", "solvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DebugAttempt_userId_exerciseSlug_key" ON "DebugAttempt"("userId", "exerciseSlug");

-- CreateIndex
CREATE INDEX "StudyTime_userId_day_idx" ON "StudyTime"("userId", "day");

-- AddForeignKey
ALTER TABLE "DebugAttempt" ADD CONSTRAINT "DebugAttempt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTime" ADD CONSTRAINT "StudyTime_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudyTime" ADD CONSTRAINT "StudyTime_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

