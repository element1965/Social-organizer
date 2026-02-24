-- CreateEnum
CREATE TYPE "ChainStatus" AS ENUM ('PROPOSED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "match_chains" (
    "id" TEXT NOT NULL,
    "status" "ChainStatus" NOT NULL DEFAULT 'PROPOSED',
    "length" INTEGER NOT NULL,
    "telegramChatUrl" TEXT,
    "chatAddedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "match_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_chain_links" (
    "id" TEXT NOT NULL,
    "chainId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "giverId" TEXT NOT NULL,
    "receiverId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "match_chain_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "match_chains_status_idx" ON "match_chains"("status");

-- CreateIndex
CREATE UNIQUE INDEX "match_chain_links_chainId_position_key" ON "match_chain_links"("chainId", "position");

-- CreateIndex
CREATE INDEX "match_chain_links_giverId_idx" ON "match_chain_links"("giverId");

-- CreateIndex
CREATE INDEX "match_chain_links_receiverId_idx" ON "match_chain_links"("receiverId");

-- AddForeignKey
ALTER TABLE "match_chain_links" ADD CONSTRAINT "match_chain_links_chainId_fkey" FOREIGN KEY ("chainId") REFERENCES "match_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chain_links" ADD CONSTRAINT "match_chain_links_giverId_fkey" FOREIGN KEY ("giverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chain_links" ADD CONSTRAINT "match_chain_links_receiverId_fkey" FOREIGN KEY ("receiverId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_chain_links" ADD CONSTRAINT "match_chain_links_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
