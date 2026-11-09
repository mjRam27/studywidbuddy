-- AlterTable
ALTER TABLE "CandidateEvaluation" ADD COLUMN     "skillGaps" TEXT[] DEFAULT ARRAY[]::TEXT[];


-- A rejected application no longer blocks a new one for the same project. Whether the new one is
-- allowed yet (7 days, or a recommended course completed since) is checked by the service; this
-- index still guarantees at most one live application per user per project.
DROP INDEX "ProjectApplication_one_live_per_project";
CREATE UNIQUE INDEX "ProjectApplication_one_live_per_project"
  ON "ProjectApplication" ("userId", "projectId") WHERE "status" NOT IN ('WITHDRAWN', 'REJECTED');
