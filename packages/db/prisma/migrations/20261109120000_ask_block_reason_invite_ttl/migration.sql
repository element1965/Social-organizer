-- AlterTable
ALTER TABLE "collections" ADD COLUMN "blockReason" TEXT;

-- AlterTable
ALTER TABLE "invite_links" ADD COLUMN "expiresAt" TIMESTAMP(3);
