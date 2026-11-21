import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS, NOTIFICATION_TTL_HOURS } from '@so/shared';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { insertCycleNotices } from '../services/cycle-notices.js';
import { dispatchPendingNeedNotices } from '../services/notice-delivery.js';

type ReceiptDb = Pick<ReturnType<typeof getDb>, 'obligation' | 'obligationReceipt'>;

/**
 * Moves the author's "received" marks of the cycle that just ended into the per-cycle history,
 * then clears them so the new cycle starts unmarked. Runs for unsubscribed people too (their
 * obligation is deleted right after; the receipt keeps the record). Idempotent: the unique key
 * (collectionId, userId, cycleNumber) plus skipDuplicates, and a second run finds no marks left.
 */
export async function recordCycleReceipts(db: ReceiptDb, collectionId: string, endedCycle: number): Promise<number> {
  const marked = await db.obligation.findMany({
    where: { collectionId, confirmedAt: { not: null } },
    select: { id: true, userId: true, amount: true, confirmedAt: true },
    orderBy: { createdAt: 'asc' },
  });
  if (marked.length === 0) return 0;

  // One receipt per person and cycle: if someone has two marked pledges, their amounts add up.
  const byUser = new Map<string, { obligationId: string; amount: number; confirmedAt: Date }>();
  for (const o of marked) {
    const at = o.confirmedAt as Date;
    const prev = byUser.get(o.userId);
    if (!prev) byUser.set(o.userId, { obligationId: o.id, amount: o.amount, confirmedAt: at });
    else byUser.set(o.userId, { obligationId: prev.obligationId, amount: prev.amount + o.amount, confirmedAt: prev.confirmedAt > at ? prev.confirmedAt : at });
  }

  const created = await db.obligationReceipt.createMany({
    data: [...byUser.entries()].map(([userId, r]) => ({
      collectionId,
      userId,
      cycleNumber: endedCycle,
      obligationId: r.obligationId,
      amount: r.amount,
      confirmedAt: r.confirmedAt,
    })),
    skipDuplicates: true,
  });
  await db.obligation.updateMany({
    where: { id: { in: marked.map((o) => o.id) } },
    data: { confirmedAt: null },
  });
  return created.count;
}

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
      // A suspension (admin or circle review) freezes the cycle: rolling over would reopen the Need.
      // Only a goal hold (no reason) rolls over; after unblock the overdue cycle closes on the next run.
      blockReason: null,
      currentCycleStart: { lte: cutoff },
    },
    select: {
      id: true,
      cycleNumber: true,
      currentCycleStart: true,
    },
  });

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const collection of expiredCycles) {
    const newCycleNumber = collection.cycleNumber + 1;

    await transactionWithRetry(db, async (tx) => {
      const currentCycleStart = new Date();
      const result = await tx.collection.updateMany({
        where: {
          id: collection.id,
          type: 'REGULAR',
          status: { in: ['ACTIVE', 'BLOCKED'] },
          blockReason: null,
          cycleNumber: collection.cycleNumber,
          currentCycleStart: { equals: collection.currentCycleStart, lte: cutoff },
        },
        data: {
          currentCycleStart,
          cycleNumber: { increment: 1 },
          status: 'ACTIVE',
          blockedAt: null,
        },
      });

      if (result.count === 0) return;

      // The author's received marks of the ended cycle go to the history; the new cycle starts unmarked
      await recordCycleReceipts(tx, collection.id, collection.cycleNumber);

      // Select each still-active recipient in the insert, after recording the ended cycle.
      await tx.$executeRaw`
        INSERT INTO notifications
          ("id", "userId", "collectionId", "type", "expiresAt", "wave", "updatedAt")
        SELECT gen_random_uuid()::text, active."userId", ${collection.id},
          'COLLECTION_CLOSED'::"NotificationType",
          ${expiresAt.toISOString()}::timestamptz AT TIME ZONE 'UTC',
          ${collection.cycleNumber}, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
        FROM (
          SELECT DISTINCT "userId" FROM obligations
          WHERE "collectionId" = ${collection.id} AND "unsubscribedAt" IS NULL
        ) active
        ON CONFLICT ("userId", "collectionId", "type", "wave") DO NOTHING
      `;

      // Remove withdrawn obligations. Their received marks are already in the history.
      await tx.obligation.deleteMany({
        where: {
          collectionId: collection.id,
          unsubscribedAt: { not: null },
        },
      });
      await insertCycleNotices(tx, collection.id, newCycleNumber, currentCycleStart, expiresAt, 'CYCLE_RENEWED');
    });
  }
  await dispatchPendingNeedNotices(db, ['start', 'closed', 'new', 'repeat']);
}
