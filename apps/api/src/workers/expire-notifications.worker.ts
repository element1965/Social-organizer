import type { Job } from 'bullmq';
import { getDb } from '@so/db';

/**
 * Every hour: mark expired notifications as EXPIRED and delete old ones.
 */
export async function processExpireNotifications(_job: Job): Promise<void> {
  const db = getDb();

  // Mark unread expired notifications
  await db.notification.updateMany({
    where: {
      status: 'UNREAD',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });

  // Delete notifications older than 7 days (already expired/dismissed/read)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const deleted = await db.notification.deleteMany({
    where: {
      status: { in: ['EXPIRED', 'DISMISSED', 'RESPONDED'] },
      expiresAt: { lte: sevenDaysAgo },
    },
  });
  if (deleted.count > 0) {
    console.log(`[Expire] Cleaned up ${deleted.count} old notifications`);
  }

  // VACUUM notifications table to reclaim disk space
  await db.$executeRawUnsafe('VACUUM notifications').catch(() => {});
}
