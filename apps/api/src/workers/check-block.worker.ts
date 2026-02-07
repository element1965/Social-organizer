import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { sendCollectionBlockedTg } from '../services/notification.service.js';

/**
 * On event: check if obligation total reached collection goal -> BLOCKED.
 */
export async function processCheckBlock(job: Job<{ collectionId: string }>): Promise<void> {
  const db = getDb();
  const { collectionId } = job.data;

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, amount: true, status: true, creatorId: true },
  });

  if (!collection || collection.status !== 'ACTIVE') return;

  // Special profile collections (without target amount) are not blocked
  if (collection.amount == null) return;

  const totalAmount = await db.obligation.aggregate({
    where: { collectionId },
    _sum: { amount: true },
  });

  if ((totalAmount._sum.amount ?? 0) >= collection.amount) {
    await db.collection.update({
      where: { id: collectionId },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
    sendCollectionBlockedTg(db, collectionId, collection.creatorId).catch((err) =>
      console.error('[TG Blocked] Failed to dispatch:', err),
    );
  }
}
