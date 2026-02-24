-- CreateTable
CREATE TABLE "skill_categories" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "skill_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_skills" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_needs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_needs_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "users" ADD COLUMN "skillsCompleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "skill_categories_key_key" ON "skill_categories"("key");
CREATE INDEX "skill_categories_group_sortOrder_idx" ON "skill_categories"("group", "sortOrder");

CREATE UNIQUE INDEX "user_skills_userId_categoryId_key" ON "user_skills"("userId", "categoryId");
CREATE INDEX "user_skills_userId_idx" ON "user_skills"("userId");
CREATE INDEX "user_skills_categoryId_idx" ON "user_skills"("categoryId");

CREATE UNIQUE INDEX "user_needs_userId_categoryId_key" ON "user_needs"("userId", "categoryId");
CREATE INDEX "user_needs_userId_idx" ON "user_needs"("userId");
CREATE INDEX "user_needs_categoryId_idx" ON "user_needs"("categoryId");

-- AddForeignKey
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_skills" ADD CONSTRAINT "user_skills_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_needs" ADD CONSTRAINT "user_needs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_needs" ADD CONSTRAINT "user_needs_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
