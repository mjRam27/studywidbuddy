-- CreateEnum
CREATE TYPE "TutorRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('GENERATING', 'READY', 'EVALUATING', 'EVALUATED', 'FAILED');

-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "summary" TEXT,
ADD COLUMN     "youtubeId" TEXT;

-- CreateTable
CREATE TABLE "LessonNote" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "lessonId" UUID NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LessonNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TutorMessage" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "lessonId" UUID,
    "role" "TutorRole" NOT NULL,
    "content" TEXT NOT NULL,
    "viaVoice" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TutorMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseAssessment" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "status" "AssessmentStatus" NOT NULL DEFAULT 'GENERATING',
    "lessonsCovered" INTEGER NOT NULL,
    "failedStage" TEXT,
    "failureReason" TEXT,
    "overallScore" INTEGER,
    "summary" TEXT,
    "strengths" TEXT[],
    "gaps" TEXT[],
    "reviewLessons" TEXT[],
    "aiModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "submittedAt" TIMESTAMP(3),
    "evaluatedAt" TIMESTAMP(3),

    CONSTRAINT "CourseAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentQuestion" (
    "id" UUID NOT NULL,
    "assessmentId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "lessonId" UUID,
    "focus" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "answer" TEXT,
    "viaVoice" BOOLEAN NOT NULL DEFAULT false,
    "answeredAt" TIMESTAMP(3),
    "score" INTEGER,
    "feedback" TEXT,
    "modelAnswer" TEXT,

    CONSTRAINT "AssessmentQuestion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LessonNote_userId_lessonId_key" ON "LessonNote"("userId", "lessonId");

-- CreateIndex
CREATE INDEX "TutorMessage_enrollmentId_createdAt_idx" ON "TutorMessage"("enrollmentId", "createdAt");

-- CreateIndex
CREATE INDEX "CourseAssessment_enrollmentId_createdAt_idx" ON "CourseAssessment"("enrollmentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentQuestion_assessmentId_position_key" ON "AssessmentQuestion"("assessmentId", "position");

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LessonNote" ADD CONSTRAINT "LessonNote_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TutorMessage" ADD CONSTRAINT "TutorMessage_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseAssessment" ADD CONSTRAINT "CourseAssessment_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "CourseAssessment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Hand-written guards (not expressible in Prisma schema).
-- At most one voice check in progress per enrollment; finished ones are kept as history.
CREATE UNIQUE INDEX "CourseAssessment_one_open_per_enrollment"
  ON "CourseAssessment" ("enrollmentId") WHERE "status" IN ('GENERATING', 'READY', 'EVALUATING');
ALTER TABLE "CourseAssessment" ADD CONSTRAINT "CourseAssessment_score_range"
  CHECK ("overallScore" IS NULL OR ("overallScore" BETWEEN 0 AND 100));
ALTER TABLE "AssessmentQuestion" ADD CONSTRAINT "AssessmentQuestion_score_range"
  CHECK ("score" IS NULL OR ("score" BETWEEN 0 AND 10));
-- Only a bare YouTube id is stored, so the player can never be pointed at an arbitrary URL.
ALTER TABLE "Lesson" ADD CONSTRAINT "Lesson_youtubeId_format"
  CHECK ("youtubeId" IS NULL OR "youtubeId" ~ '^[A-Za-z0-9_-]{11}$');
