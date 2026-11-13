-- The graph cache checks every few seconds whether connections changed: the newest connection, the number
-- of connections and the number of deleted accounts. Without these indexes each part reads a whole table
-- (150–190 ms on 100,000 people and 643,000 connections). The code works without them, only slower.
CREATE INDEX "connections_createdAt_idx" ON "connections"("createdAt");
CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");
