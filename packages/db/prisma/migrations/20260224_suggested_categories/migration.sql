-- CreateEnum
CREATE TYPE "SuggestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "suggested_categories" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" "SuggestStatus" NOT NULL DEFAULT 'PENDING',
    "categoryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "suggested_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suggested_categories_status_idx" ON "suggested_categories"("status");

-- AddForeignKey
ALTER TABLE "suggested_categories"
    ADD CONSTRAINT "suggested_categories_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suggested_categories"
    ADD CONSTRAINT "suggested_categories_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
