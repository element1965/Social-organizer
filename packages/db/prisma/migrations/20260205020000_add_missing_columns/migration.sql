-- CreateEnum
CREATE TYPE "VoiceGender" AS ENUM ('MALE', 'FEMALE');

-- AlterTable: users — add missing columns
ALTER TABLE "users" ADD COLUMN "email" TEXT;
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;
ALTER TABLE "users" ADD COLUMN "voiceGender" "VoiceGender" NOT NULL DEFAULT 'FEMALE';
ALTER TABLE "users" ADD COLUMN "preferredCurrency" TEXT NOT NULL DEFAULT 'USD';
ALTER TABLE "users" ADD COLUMN "monthlyBudget" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "remainingBudget" DOUBLE PRECISION;
ALTER TABLE "users" ADD COLUMN "budgetUpdatedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- AlterTable: collections — add original currency columns
ALTER TABLE "collections" ADD COLUMN "originalAmount" DOUBLE PRECISION;
ALTER TABLE "collections" ADD COLUMN "originalCurrency" TEXT;

-- AlterTable: obligations — add original currency columns
ALTER TABLE "obligations" ADD COLUMN "originalAmount" DOUBLE PRECISION;
ALTER TABLE "obligations" ADD COLUMN "originalCurrency" TEXT;
