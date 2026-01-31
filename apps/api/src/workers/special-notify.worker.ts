import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { SPECIAL_NOTIFY_AFTER_DAYS, NOTIFICATION_TTL_HOURS } from '@so/shared';

/**
 * Каждый час: проверяем пользователей, зарегистрированных 3 дня назад.
 * Отправляем уведомление о сборах Автора и Разработчика.
 */
export async function processSpecialNotify(_job: Job): Promise<void> {
  const db = getDb();

  const threeDaysAgo = new Date(Date.now() - SPECIAL_NOTIFY_AFTER_DAYS * 24 * 60 * 60 * 1000);
  const threeDaysAgoMinus1h = new Date(threeDaysAgo.getTime() - 60 * 60 * 1000);

  // Пользователи, зарегистрированные примерно 3 дня назад (окно 1 час)
  const newUsers = await db.user.findMany({
    where: {
      createdAt: { gte: threeDaysAgoMinus1h, lte: threeDaysAgo },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (newUsers.length === 0) return;

  // Найти активные сборы Автора и Разработчика
  const specialCollections = await db.collection.findMany({
    where: {
      status: 'ACTIVE',
      creator: { role: { in: ['AUTHOR', 'DEVELOPER'] } },
    },
    select: { id: true, creator: { select: { role: true } } },
  });

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const user of newUsers) {
    for (const col of specialCollections) {
      const type = col.creator.role === 'AUTHOR' ? 'SPECIAL_AUTHOR' : 'SPECIAL_DEVELOPER';
      try {
        await db.notification.upsert({
          where: {
            userId_collectionId_wave: { userId: user.id, collectionId: col.id, wave: 0 },
          },
          create: {
            userId: user.id,
            collectionId: col.id,
            type,
            handshakePath: [],
            expiresAt,
            wave: 0,
          },
          update: {},
        });
      } catch {
        // skip
      }
    }
  }
}
