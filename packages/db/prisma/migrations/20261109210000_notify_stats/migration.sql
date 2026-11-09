-- How people react to requests for help: decayed counters for routing notification waves
CREATE TABLE "notify_stats" (
    "userId" TEXT NOT NULL,
    "sent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opened" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "responded" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dismissed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "ignoreStreak" INTEGER NOT NULL DEFAULT 0,
    "responseMinutes" DOUBLE PRECISION,
    "lastSentAt" TIMESTAMP(3),
    "lastRespondedAt" TIMESTAMP(3),
    "decayedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notify_stats_pkey" PRIMARY KEY ("userId")
);

ALTER TABLE "notify_stats" ADD CONSTRAINT "notify_stats_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
