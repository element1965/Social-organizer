-- Inactivity cleanup (accounts without sign-ins for 2 years are deleted after two warnings).
-- Additive only. Applied in production by hand.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "inactivityStage" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "inactivityWarnedAt" TIMESTAMP(3);
