-- "X confirmed the acquaintance" in the requester's Circle feed: seen and dismissed are kept on the server,
-- so the row does not come back on every new device (it was kept in the device's localStorage).
ALTER TABLE "pending_connections" ADD COLUMN "requesterSeenAt" TIMESTAMP(3);
ALTER TABLE "pending_connections" ADD COLUMN "requesterDismissedAt" TIMESTAMP(3);

-- Confirmations older than a day were already shown somewhere: do not bring them back.
UPDATE "pending_connections"
SET "requesterSeenAt" = NOW()
WHERE "status" = 'ACCEPTED' AND "resolvedAt" < NOW() - INTERVAL '1 day';
