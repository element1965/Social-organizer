import type { Job } from 'bullmq';
import { getDb } from '@so/db';

/**
 * Каждый час: помечаем просроченные (24ч) уведомления как EXPIRED.
 */
export async function processExpireNotifications(_job: Job): Promise<void> {
  const db = getDb();

  await db.notification.updateMany({
    where: {
      status: 'UNREAD',
      expiresAt: { lte: new Date() },
    },
    data: { status: 'EXPIRED' },
  });
}
