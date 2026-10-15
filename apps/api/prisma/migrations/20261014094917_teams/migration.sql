-- CreateEnum
CREATE TYPE "SelectionRunStatus" AS ENUM ('PROPOSED', 'APPLIED', 'DISCARDED');

-- CreateEnum
CREATE TYPE "TeamMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'DECLINED', 'LEFT');

-- CreateTable
CREATE TABLE "TeamSelectionRun" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "status" "SelectionRunStatus" NOT NULL DEFAULT 'PROPOSED',
    "summary" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "appliedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedAt" TIMESTAMP(3),

    CONSTRAINT "TeamSelectionRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSelectionDecision" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "selected" BOOLEAN NOT NULL,
    "roleId" UUID,
    "fit" DOUBLE PRECISION NOT NULL,
    "reasons" TEXT[],

    CONSTRAINT "TeamSelectionDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" UUID NOT NULL,
    "projectId" UUID NOT NULL,
    "formedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamMember" (
    "id" UUID NOT NULL,
    "teamId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "roleId" UUID NOT NULL,
    "applicationId" UUID NOT NULL,
    "status" "TeamMemberStatus" NOT NULL DEFAULT 'INVITED',
    "invitedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),

    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamSelectionRun_projectId_createdAt_idx" ON "TeamSelectionRun"("projectId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSelectionDecision_runId_applicationId_key" ON "TeamSelectionDecision"("runId", "applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_projectId_key" ON "Team"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_applicationId_key" ON "TeamMember"("applicationId");

-- CreateIndex
CREATE INDEX "TeamMember_userId_status_idx" ON "TeamMember"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "TeamMember_teamId_userId_key" ON "TeamMember"("teamId", "userId");

-- AddForeignKey
ALTER TABLE "TeamSelectionRun" ADD CONSTRAINT "TeamSelectionRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSelectionDecision" ADD CONSTRAINT "TeamSelectionDecision_runId_fkey" FOREIGN KEY ("runId") REFERENCES "TeamSelectionRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSelectionDecision" ADD CONSTRAINT "TeamSelectionDecision_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProjectApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSelectionDecision" ADD CONSTRAINT "TeamSelectionDecision_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProjectRole"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ProjectRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "ProjectApplication"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ── Hand-written ──
ALTER TABLE "TeamSelectionDecision" ADD CONSTRAINT "TeamSelectionDecision_fit_range" CHECK ("fit" >= 0 AND "fit" <= 1);
-- A selected decision always names a role.
ALTER TABLE "TeamSelectionDecision" ADD CONSTRAINT "TeamSelectionDecision_selected_has_role" CHECK (NOT "selected" OR "roleId" IS NOT NULL);
