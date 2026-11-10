import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { pruneDeliveries } from '../services/delivery.service.js';

/**
 * Every hour: mark expired notifications as EXPIRED and delete old ones.
 */
export async function processExpireNotifications(_job: Job): Promise<void> {
  const db = getDb();

  // Delivery keys are only needed to stop repeats; old ones are dropped (SO-45)
  await pruneDeliveries(db);

  // Mark unread expired notifications
  await db.notification.updateMany({
    where: {
      status: 'UNREAD',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  // Delete notifications older than 7 days (already expired/dismissed/read).
  // Request entries of a collection that is still open are kept: they are the only record of who
  // has already been told, and the repeat waves (re-notify, special-notify) must not tell anyone twice.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db.notification.deleteMany({
    where: {
      status: { in: ['EXPIRED', 'DISMISSED', 'RESPONDED'] },
      expiresAt: { lte: sevenDaysAgo },
      NOT: {
        type: { in: ['NEW_COLLECTION', 'RE_NOTIFY', 'SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER'] },
        collection: { status: { in: ['ACTIVE', 'BLOCKED'] } },
      },
    },
  });
  if (deleted.count > 0) {
    console.log(`[Expire] Cleaned up ${deleted.count} old notifications`);
  }

  // VACUUM notifications table to reclaim disk space
  await db.$executeRawUnsafe('VACUUM notifications').catch(() => {});
}
