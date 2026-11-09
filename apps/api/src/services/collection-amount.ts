import type { Prisma, PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { sendGoalReachedToCreator } from './notification.service.js';

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

/**
 * Goal-reached BLOCKED (blockReason stays null) follows the active total.
 * A hold with any blockReason, including COMMUNITY, is never opened, cleared, or replaced.
 * The write is conditional on the status and reason just read, so a circle hold that lands
 * between the read and the write is left untouched.
 */
export async function syncCollectionGoal(db: PrismaClient, collectionId: string): Promise<void> {
  const collection = await db.collection.findUnique({ where: { id: collectionId } });
  if (!collection || collection.amount == null) return;

  const { amount: sum } = await activeObligationTotals(db, collectionId);
  if (sum >= collection.amount && collection.status === 'ACTIVE' && collection.blockReason == null) {
    const blocked = await db.collection.updateMany({
      where: { id: collectionId, status: 'ACTIVE', blockReason: null },
      data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: null },
    });
    if (blocked.count !== 1) return;

    await db.notification.updateMany({
      where: {
        collectionId,
        type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
        status: { in: ['UNREAD', 'READ'] },
      },
      data: { status: 'EXPIRED' },
    });

    const notifiedUsers = await db.notification.findMany({
      where: { collectionId },
      select: { userId: true },
      distinct: ['userId'],
    });
    const pledgedUserIds = new Set(
      (await db.obligation.findMany({
        where: { collectionId },
        select: { userId: true },
      })).map((row) => row.userId),
    );
    const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
    for (const { userId } of notifiedUsers) {
      if (userId === collection.creatorId) continue;
      if (pledgedUserIds.has(userId)) continue;
      try {
        await db.notification.upsert({
          where: {
            userId_collectionId_type_wave: {
              userId, collectionId, type: 'COLLECTION_BLOCKED', wave: 0,
            },
          },
          create: {
            userId, collectionId,
            type: 'COLLECTION_BLOCKED', handshakePath: [], expiresAt, wave: 0,
          },
          update: { status: 'UNREAD', expiresAt },
        });
      } catch { /* skip */ }
    }

    sendGoalReachedToCreator(db, collectionId, collection.creatorId).catch((err) =>
      console.error('[TG GoalReached] Failed:', err),
    );
    return;
  }

  if (sum < collection.amount && collection.status === 'BLOCKED' && collection.blockReason == null) {
    const reopened = await db.collection.updateMany({
      where: { id: collectionId, status: 'BLOCKED', blockReason: null },
      data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
    });
    if (reopened.count !== 1) return;
    await db.notification.updateMany({
      where: {
        collectionId,
        type: 'COLLECTION_BLOCKED',
        status: { in: ['UNREAD', 'READ'] },
      },
      data: { status: 'EXPIRED' },
    });
  }
}
