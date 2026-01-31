import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { NOTIFICATION_RATIO } from '@so/shared';
import { sendCollectionNotifications } from '../services/notification.service.js';

/**
 * Каждые 12 часов: находим активные сборы и рассылаем повторные уведомления
 * через BFS. Количество доуведомлений = (оставшаяся сумма) / NOTIFICATION_RATIO.
 */
export async function processReNotify(_job: Job): Promise<void> {
  const db = getDb();

  const activeCollections = await db.collection.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true,
      creatorId: true,
      amount: true,
      obligations: { select: { amount: true } },
    },
  });

  for (const collection of activeCollections) {
    // Спецпрофильные сборы (без суммы) не участвуют в доуведомлении
    if (collection.amount == null) continue;

    const currentAmount = collection.obligations.reduce((sum, o) => sum + o.amount, 0);
    const remaining = collection.amount - currentAmount;
    if (remaining <= 0) continue;

    const maxRecipients = Math.ceil(remaining / NOTIFICATION_RATIO);

    // Определяем номер волны: макс wave + 1
    const lastNotification = await db.notification.findFirst({
      where: { collectionId: collection.id, type: 'RE_NOTIFY' },
      orderBy: { wave: 'desc' },
      select: { wave: true },
    });
    const nextWave = (lastNotification?.wave ?? 1) + 1;

    await sendCollectionNotifications(
      db,
      collection.id,
      collection.creatorId,
      'RE_NOTIFY',
      nextWave,
      maxRecipients,
    );
  }
}
