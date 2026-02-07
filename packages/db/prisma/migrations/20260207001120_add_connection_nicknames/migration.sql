-- AlterTable
ALTER TABLE "collections" ALTER COLUMN "currency" SET DEFAULT 'USD';

-- AlterTable
ALTER TABLE "connections" ADD COLUMN     "nicknameByA" TEXT,
ADD COLUMN     "nicknameByB" TEXT;
