-- Add type column to suggested_categories (SKILL or NEED)
ALTER TABLE "suggested_categories" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'SKILL';
