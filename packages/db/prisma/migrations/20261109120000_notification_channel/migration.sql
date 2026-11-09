-- CreateEnum
CREATE TYPE "NotifyChannel" AS ENUM ('APP', 'TELEGRAM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "notifyChannel" "NotifyChannel",
ADD COLUMN     "notifyNewCollections" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "collections" ADD COLUMN     "creatorViewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "notification_deliveries" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "channel" "NotifyChannel" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notification_deliveries_createdAt_idx" ON "notification_deliveries"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_deliveries_userId_eventKey_key" ON "notification_deliveries"("userId", "eventKey");

-- AddForeignKey
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

