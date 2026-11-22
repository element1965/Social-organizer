import { Prisma, type PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { sendGoalReachedToCreator } from './notification.service.js';
import { findNeedForUpdate, type NeedState } from './collection-state.js';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Pledges that still count. Declined rows (unsubscribedAt) are out.
 * A cycle acknowledgement does not add or remove anyone: the same row counts
 * every cycle until the person declines.
 */
export async function activeObligationTotals(
  db: Db,
  collectionId: string,
): Promise<{ amount: number; count: number }> {
  const total = await db.obligation.aggregate({
    where: { collectionId, unsubscribedAt: null },
    _sum: { amount: true },
    _count: true,
  });
  return {
    amount: total._sum.amount ?? 0,
    count: total._count,
  };
}

type GoalHold = { blockedAt: Date; creatorId: string };

/** Apply the goal state while the caller holds the Need lock, using the latest active total. */
export async function applyCollectionGoal(
  tx: Prisma.TransactionClient,
  collectionId: string,
  collection: NeedState,
): Promise<GoalHold | undefined> {
  if (collection.blockReason != null ||
    (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED')) return;

  const reached = collection.amount != null && (await activeObligationTotals(tx, collectionId)).amount >= collection.amount;
  if (reached && collection.status === 'ACTIVE') {
    const blockedAt = new Date();
    await tx.collection.update({
      where: { id: collectionId },
      data: { status: 'BLOCKED', blockedAt },
    });
    await tx.notification.updateMany({
      where: {
        collectionId,
        type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
        status: 'UNREAD',
      },
      data: { status: 'EXPIRED' },
    });
    // Keep the recipient's open for receipt accounting. End its waiting lifetime even if the Need reopens.
    await tx.notification.updateMany({
      where: {
        collectionId,
        type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
        status: 'READ',
        expiresAt: { gt: blockedAt },
      },
      data: { expiresAt: blockedAt },
    });
    return { blockedAt, creatorId: collection.creatorId };
  }

  if (!reached && collection.status === 'BLOCKED') {
    await tx.collection.update({
      where: { id: collectionId },
      data: { status: 'ACTIVE', blockedAt: null },
    });
    await tx.notification.updateMany({
      where: { collectionId, type: 'COLLECTION_BLOCKED', status: { in: ['UNREAD', 'READ'] } },
      data: { status: 'EXPIRED' },
    });
  }
}

export async function dispatchCollectionGoalReached(db: PrismaClient, collectionId: string, hold: GoalHold): Promise<void> {
  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
  try {
    await notifyGoalReached(db, collectionId, hold.creatorId, expiresAt, hold.blockedAt);
  } finally {
    sendGoalReachedToCreator(db, collectionId, hold.creatorId, hold.blockedAt).catch((err) =>
      console.error('[GoalReached] Author delivery failed:', err),
    );
  }
}

export async function syncCollectionGoal(db: PrismaClient, collectionId: string): Promise<void> {
  const hold = await transactionWithRetry(db, async (tx) => {
    const collection = await findNeedForUpdate(tx, collectionId);
    if (collection) return applyCollectionGoal(tx, collectionId, collection);
  });
  if (hold) await dispatchCollectionGoalReached(db, collectionId, hold);
}

/**
 * Tells everyone who was notified about this Need that the goal is reached:
 * one COLLECTION_BLOCKED row (wave 0) per distinct notified person, except the
 * author and anyone with an obligation on it (declined pledges included).
 * An existing row goes back to UNREAD with the new expiry.
 *
 * One set-based statement instead of a round trip per person. The recipient set
 * is computed inside the statement, so there is no parameter list to chunk.
 * If the statement fails (for example a person deleted mid-statement breaks the
 * foreign key), it falls back to the per-row upsert, which skips a failing row
 * and keeps the others, exactly as before.
 */
export async function notifyGoalReached(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  expiresAt: Date,
  blockedAt?: Date,
): Promise<void> {
  // Prisma stores DateTime as UTC wall time in timestamp(3) columns.
  const expires = Prisma.sql`${expiresAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
  const now = Prisma.sql`${new Date().toISOString()}::timestamptz AT TIME ZONE 'UTC'`;
  const sameHold = blockedAt ? Prisma.sql` AND EXISTS (
    SELECT 1 FROM collections
    WHERE "id" = ${collectionId} AND "status" = 'BLOCKED' AND "blockReason" IS NULL
      AND "blockedAt" = ${blockedAt.toISOString()}::timestamptz AT TIME ZONE 'UTC'
    FOR SHARE
  )
  ` : Prisma.empty;
  const upsertNotices = (userId?: string) => Prisma.sql`
    INSERT INTO notifications
      ("id", "userId", "collectionId", "type", "handshakePath", "status", "expiresAt", "wave", "createdAt", "updatedAt")
    SELECT gen_random_uuid()::text, n."userId", ${collectionId},
      'COLLECTION_BLOCKED'::"NotificationType", '[]'::jsonb, 'UNREAD'::"NotificationStatus", ${expires}, 0, ${now}, ${now}
    FROM (SELECT DISTINCT "userId" FROM notifications WHERE "collectionId" = ${collectionId}) n
    WHERE n."userId" <> ${creatorId}
      ${userId === undefined ? Prisma.empty : Prisma.sql` AND n."userId" = ${userId}`}
      ${sameHold}
      AND NOT EXISTS (
        SELECT 1 FROM obligations o WHERE o."collectionId" = ${collectionId} AND o."userId" = n."userId"
      )
    ON CONFLICT ("userId", "collectionId", "type", "wave") DO UPDATE
      SET "status" = 'UNREAD'::"NotificationStatus", "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = EXCLUDED."updatedAt"
  `;
  try {
    await db.$executeRaw(upsertNotices());
    return;
  } catch (err) {
    console.error('[GoalReached] Batch notice failed, retrying per person:', err);
  }

  const notifiedUsers = await db.notification.findMany({
    where: { collectionId, userId: { not: creatorId } },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const { userId } of notifiedUsers) {
    try {
      await db.$queryRaw`${upsertNotices(userId)} RETURNING "userId"`;
    } catch (err) {
      console.error('[GoalReached] Notice retry failed:', err);
    }
  }
}
