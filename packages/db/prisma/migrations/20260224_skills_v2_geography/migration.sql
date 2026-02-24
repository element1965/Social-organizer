-- Add isOnline flag to skill_categories
ALTER TABLE "skill_categories" ADD COLUMN "isOnline" BOOLEAN NOT NULL DEFAULT false;

-- Add geography fields to users
ALTER TABLE "users" ADD COLUMN "city" TEXT;
ALTER TABLE "users" ADD COLUMN "country_code" TEXT;
ALTER TABLE "users" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "longitude" DOUBLE PRECISION;
