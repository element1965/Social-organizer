-- "Who was already told about this Need" is read on every notification wave and on close
CREATE INDEX "notifications_collectionId_idx" ON "notifications"("collectionId");

-- Uploaded photos move out of users.photoUrl (data URL inside every list of people) into their own table
CREATE TABLE "user_avatars" (
    "userId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_avatars_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "user_avatars" ADD CONSTRAINT "user_avatars_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
