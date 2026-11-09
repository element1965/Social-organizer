-- AlterTable
ALTER TABLE "connections" ADD COLUMN "viaCollectionId" TEXT;

-- CreateIndex
CREATE INDEX "connections_viaCollectionId_idx" ON "connections"("viaCollectionId");
