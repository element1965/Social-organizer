-- SO-14: contacts are visible only to direct connections by default.
-- Applies to everyone; each user can share contacts with all in Settings.
ALTER TABLE "users" ALTER COLUMN "hideContacts" SET DEFAULT true;
UPDATE "users" SET "hideContacts" = true WHERE "hideContacts" = false;
