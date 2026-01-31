-- DropIndex
DROP INDEX "notifications_userId_collectionId_wave_key";

-- CreateIndex
CREATE UNIQUE INDEX "notifications_userId_collectionId_type_wave_key" ON "notifications"("userId", "collectionId", "type", "wave");
