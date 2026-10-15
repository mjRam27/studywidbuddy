-- Display category shown on project cards, e.g. "LOGISTICS · WEB PLATFORM".
ALTER TABLE "Project" ADD COLUMN "category" TEXT NOT NULL DEFAULT 'GENERAL';
