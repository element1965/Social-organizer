import { Prisma } from '@so/db';
import { enqueueNeedNotice } from './notice-delivery.js';

type CycleNotice = 'CYCLE_RENEWED' | 'CYCLE_RENEWAL_REMINDER';

/** The eligible participants and the rows this run inserted must come from the same statement. */
export async function insertCycleNotices(
  tx: Prisma.TransactionClient,
  collectionId: string,
  cycleNumber: number,
  currentCycleStart: Date | null,
  expiresAt: Date,
  type: CycleNotice,
): Promise<void> {
  const optedIn = type === 'CYCLE_RENEWED' ? Prisma.sql`u."notifyRenewalStart"` : Prisma.sql`u."notifyRenewalReminder"`;
  const rows = await tx.$queryRaw<{ userId: string }[]>`
    INSERT INTO notifications ("id", "userId", "collectionId", "type", "expiresAt", "wave", "updatedAt")
    SELECT gen_random_uuid()::text, active."userId", ${collectionId},
      ${type}::"NotificationType", ${expiresAt.toISOString()}::timestamptz AT TIME ZONE 'UTC',
      ${cycleNumber}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
    FROM (
      SELECT DISTINCT o."userId"
      FROM obligations o
      JOIN users u ON u."id" = o."userId"
      JOIN collections c ON c."id" = o."collectionId"
      WHERE c."id" = ${collectionId}
        AND c."type" = 'REGULAR' AND c."status" IN ('ACTIVE', 'BLOCKED') AND c."blockReason" IS NULL
        AND c."cycleNumber" = ${cycleNumber}
        AND c."currentCycleStart" = ${currentCycleStart?.toISOString() ?? null}::timestamptz AT TIME ZONE 'UTC'
        AND o."unsubscribedAt" IS NULL AND o."userId" <> c."creatorId"
        AND u."deletedAt" IS NULL AND ${optedIn}
    ) active
    ON CONFLICT ("userId", "collectionId", "type", "wave") DO NOTHING
    RETURNING "userId"
  `;
  await enqueueNeedNotice(tx, type === 'CYCLE_RENEWED' ? 'start' : 'reminder', collectionId, cycleNumber,
    rows.map(({ userId }) => userId));
}
