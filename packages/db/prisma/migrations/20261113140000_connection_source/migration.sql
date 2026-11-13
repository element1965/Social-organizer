-- Where a request and a connection came from (personal link, live QR, shake, a Need page, a direct
-- request, a suggestion, the bot). Used by the admin funnel only; older rows stay NULL.
ALTER TABLE "connections" ADD COLUMN "source" TEXT;
ALTER TABLE "pending_connections" ADD COLUMN "source" TEXT;

-- The one source already known for old rows: a connection made from a public Need page.
UPDATE "connections" SET "source" = 'need' WHERE "viaCollectionId" IS NOT NULL;

-- Guests who opened an invite page: a number per day and source, nothing about the person.
CREATE TABLE "invite_open_days" (
    "day" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "invite_open_days_pkey" PRIMARY KEY ("day", "source")
);
