-- AlterTable
ALTER TABLE "faq_items" ADD COLUMN "viewCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "faq_items" ADD COLUMN "groupId" TEXT;
ALTER TABLE "faq_items" ADD COLUMN "isLocalized" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "faq_items_groupId_idx" ON "faq_items"("groupId");
