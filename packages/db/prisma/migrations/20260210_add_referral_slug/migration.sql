-- AlterTable
ALTER TABLE "users" ADD COLUMN "referralSlug" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_referralSlug_key" ON "users"("referralSlug");
