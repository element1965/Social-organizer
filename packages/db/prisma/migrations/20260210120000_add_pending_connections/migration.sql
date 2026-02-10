-- CreateEnum
CREATE TYPE "PendingConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "pending_connections" (
    "id" TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId" TEXT NOT NULL,
    "status" "PendingConnectionStatus" NOT NULL DEFAULT 'PENDING',
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pending_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pending_connections_toUserId_status_idx" ON "pending_connections"("toUserId", "status");

-- CreateIndex
CREATE INDEX "pending_connections_fromUserId_status_idx" ON "pending_connections"("fromUserId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pending_connections_fromUserId_toUserId_key" ON "pending_connections"("fromUserId", "toUserId");

-- AddForeignKey
ALTER TABLE "pending_connections" ADD CONSTRAINT "pending_connections_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_connections" ADD CONSTRAINT "pending_connections_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
