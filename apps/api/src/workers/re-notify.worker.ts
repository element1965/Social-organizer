import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { sendCollectionNotifications } from '../services/notification.service';

/**
 * Каждые 12 часов: находим активные сборы и рассылаем повторные уведомления
 * через BFS. Увеличиваем wave на 1.
 */
export async function processReNotify(_job: Job): Promise<void> {
  const db = getDb();

  const activeCollections = await db.collection.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true, creatorId: true },
  });

  for (const collection of activeCollections) {
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
    );
  }
}
