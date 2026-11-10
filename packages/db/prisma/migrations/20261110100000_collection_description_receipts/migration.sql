-- What a collection is for: short plain text shown on the collection page and the public landing
ALTER TABLE "collections" ADD COLUMN "description" TEXT;

-- The author's private "received" mark per finished cycle of a regular collection.
-- obligationId is SET NULL on delete: obligations of people who unsubscribed are removed at cycle close,
-- the record of the ended cycle stays.
CREATE TABLE "obligation_receipts" (
    "id" TEXT NOT NULL,
    "obligationId" TEXT,
    "collectionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "confirmedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligation_receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "obligation_receipts_collectionId_cycleNumber_idx" ON "obligation_receipts"("collectionId", "cycleNumber");

CREATE UNIQUE INDEX "obligation_receipts_collectionId_userId_cycleNumber_key" ON "obligation_receipts"("collectionId", "userId", "cycleNumber");

ALTER TABLE "obligation_receipts" ADD CONSTRAINT "obligation_receipts_obligationId_fkey" FOREIGN KEY ("obligationId") REFERENCES "obligations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "obligation_receipts" ADD CONSTRAINT "obligation_receipts_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "obligation_receipts" ADD CONSTRAINT "obligation_receipts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
