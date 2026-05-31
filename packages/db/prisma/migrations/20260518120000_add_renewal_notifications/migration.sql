-- Add new enum values for regular collection cycle notifications
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CYCLE_RENEWAL_REMINDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'CYCLE_RENEWED';

-- Per-user toggles for cycle renewal reminders
ALTER TABLE "users" ADD COLUMN "notifyRenewalReminder" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "users" ADD COLUMN "notifyRenewalStart" BOOLEAN NOT NULL DEFAULT true;
