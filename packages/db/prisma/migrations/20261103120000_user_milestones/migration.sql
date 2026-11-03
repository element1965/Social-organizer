-- SO-44: two milestones of the money MVP (first handshake, 10 direct connections).
CREATE TYPE "MilestoneKind" AS ENUM ('FIRST_CONNECTION', 'TEN_CONNECTIONS');

CREATE TABLE "user_milestones" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "MilestoneKind" NOT NULL,
    "achievedAt" TIMESTAMP(3) NOT NULL,
    "relatedUserId" TEXT,
    "seenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_milestones_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_milestones_userId_kind_key" ON "user_milestones"("userId", "kind");

ALTER TABLE "user_milestones" ADD CONSTRAINT "user_milestones_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
