-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN     "transcriptSegments" JSONB,
ADD COLUMN     "transcriptSource" TEXT;

-- AlterTable
ALTER TABLE "TutorMessage" ADD COLUMN     "atSec" INTEGER;
