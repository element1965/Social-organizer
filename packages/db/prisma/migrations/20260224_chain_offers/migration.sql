-- Add offer and confirmation fields to match_chain_links
ALTER TABLE "match_chain_links" ADD COLUMN "offerHours" DOUBLE PRECISION;
ALTER TABLE "match_chain_links" ADD COLUMN "offerDescription" TEXT;
ALTER TABLE "match_chain_links" ADD COLUMN "giverConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "match_chain_links" ADD COLUMN "receiverConfirmed" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "match_chain_links" ADD COLUMN "giverCompleted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "match_chain_links" ADD COLUMN "receiverCompleted" BOOLEAN NOT NULL DEFAULT false;
