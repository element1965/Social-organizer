-- Circle moderation of a collection: reports, one open review, votes.
-- Applied in production by hand. Local setups can use prisma db push for the tables
-- and must also create the partial unique index at the bottom.

-- CreateEnum
CREATE TYPE "ComplaintReason" AS ENUM ('COMPLAINTS', 'SUSPECTED_FRAUD', 'RULES_VIOLATION', 'ACCOUNT_HACKED');

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('OPEN', 'UPHELD', 'DISMISSED');

-- CreateEnum
CREATE TYPE "ReviewAnswer" AS ENUM ('PROBLEM', 'OK', 'UNKNOWN');

-- AlterTable
ALTER TABLE "users" ADD COLUMN "complaintStrikes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "complaintBanUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "collection_complaints" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "reason" "ComplaintReason" NOT NULL,
    "comment" VARCHAR(280),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_reviews" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closesAt" TIMESTAMP(3) NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'OPEN',
    "decidedAt" TIMESTAMP(3),
    "audienceIds" TEXT[] DEFAULT ARRAY[]::TEXT[],

    CONSTRAINT "collection_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_review_votes" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "ReviewAnswer" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collection_review_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "collection_complaints_collectionId_userId_key" ON "collection_complaints"("collectionId", "userId");
CREATE INDEX "collection_complaints_userId_idx" ON "collection_complaints"("userId");
CREATE INDEX "collection_reviews_collectionId_status_idx" ON "collection_reviews"("collectionId", "status");
CREATE INDEX "collection_reviews_status_closesAt_idx" ON "collection_reviews"("status", "closesAt");
CREATE UNIQUE INDEX "collection_review_votes_reviewId_userId_key" ON "collection_review_votes"("reviewId", "userId");
CREATE INDEX "collection_review_votes_userId_idx" ON "collection_review_votes"("userId");

-- One open review per collection. Prisma schema cannot express a partial index.
CREATE UNIQUE INDEX "collection_reviews_one_open_idx" ON "collection_reviews"("collectionId") WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "collection_complaints" ADD CONSTRAINT "collection_complaints_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_complaints" ADD CONSTRAINT "collection_complaints_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_reviews" ADD CONSTRAINT "collection_reviews_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_review_votes" ADD CONSTRAINT "collection_review_votes_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "collection_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "collection_review_votes" ADD CONSTRAINT "collection_review_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
