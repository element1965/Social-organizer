-- Product decision 2026-11-11: contacts are not hidden by default; each person chooses in Settings.
-- Only the default for new accounts changes. Existing choices are left as they are.
ALTER TABLE "users" ALTER COLUMN "hideContacts" SET DEFAULT false;
