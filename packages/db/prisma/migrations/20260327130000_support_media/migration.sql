-- Add media columns to support_messages
ALTER TABLE "support_messages" ADD COLUMN "mediaFileId" TEXT;
ALTER TABLE "support_messages" ADD COLUMN "mediaType" TEXT;
ALTER TABLE "support_messages" ADD COLUMN "mediaName" TEXT;
ALTER TABLE "support_messages" ALTER COLUMN "message" SET DEFAULT '';
