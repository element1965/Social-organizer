import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS, NOTIFICATION_TTL_HOURS } from '@so/shared';

/**
 * Every hour: check regular collections with completed 28-day cycle.
 * Close current cycle and open new one.
 * Obligations are NOT deleted (kept for history/statistics).
 */
export async function processCycleClose(_job: Job): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000);

  const expiredCycles = await db.collection.findMany({
    where: {
      type: 'REGULAR',
      status: { in: ['ACTIVE', 'BLOCKED'] },
      currentCycleStart: { lte: cutoff },
    },
    select: {
      id: true,
      amount: true,
      currency: true,
      cycleNumber: true,
      obligations: { select: { amount: true, userId: true } },
    },
  });

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const collection of expiredCycles) {
    // Check undercollection (only for collections with target amount)
    const currentAmount = collection.obligations.reduce((sum, o) => sum + o.amount, 0);
    const hasGoal = collection.amount != null;
    const undercollected = hasGoal && currentAmount < collection.amount!;

    await db.$transaction(async (tx) => {
      // Close current cycle -> new one
      await tx.collection.update({
        where: { id: collection.id },
        data: {
          currentCycleStart: new Date(),
          cycleNumber: { increment: 1 },
          status: 'ACTIVE',
          blockedAt: null,
        },
      });

      // Notification about cycle closure (with undercollection if needed)
      const notifType = undercollected ? 'COLLECTION_CLOSED' : 'COLLECTION_CLOSED';
      const participantIds = [...new Set(collection.obligations.map((o) => o.userId))];
      for (const userId of participantIds) {
        try {
          await tx.notification.create({
            data: {
              userId,
              collectionId: collection.id,
              type: notifType,
              handshakePath: [],
              expiresAt,
              wave: collection.cycleNumber, // wave = номер завершённого цикла
            },
          });
        } catch { /* skip duplicates */ }
      }

      // Delete ONLY unsubscribed subscriptions (one-time obligations are kept for statistics)
      await tx.obligation.deleteMany({
        where: {
          collectionId: collection.id,
          unsubscribedAt: { not: null },
        },
      });
    });
  }
}
