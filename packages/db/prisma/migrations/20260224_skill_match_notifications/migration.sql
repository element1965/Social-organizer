-- CreateTable
CREATE TABLE "skill_match_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchUserId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "status" "NotificationStatus" NOT NULL DEFAULT 'UNREAD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_match_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "skill_match_notifications_userId_matchUserId_categoryId_key"
    ON "skill_match_notifications"("userId", "matchUserId", "categoryId");

-- CreateIndex
CREATE INDEX "skill_match_notifications_userId_status_idx"
    ON "skill_match_notifications"("userId", "status");

-- AddForeignKey
ALTER TABLE "skill_match_notifications"
    ADD CONSTRAINT "skill_match_notifications_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_match_notifications"
    ADD CONSTRAINT "skill_match_notifications_matchUserId_fkey"
    FOREIGN KEY ("matchUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "skill_match_notifications"
    ADD CONSTRAINT "skill_match_notifications_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
