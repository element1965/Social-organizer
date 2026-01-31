import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';

/**
 * Каждый час: находим пользователей, которые впервые помогли кому-то
 * (создали обязательство), но ещё не получали уведомление о сборах
 * Автора/Разработчика. Отправляем им уведомление.
 */
export async function processSpecialNotify(_job: Job): Promise<void> {
  const db = getDb();

  // Найти активные сборы Автора и Разработчика
  const specialCollections = await db.collection.findMany({
    where: {
      status: 'ACTIVE',
      creator: { role: { in: ['AUTHOR', 'DEVELOPER'] } },
    },
    select: { id: true, creator: { select: { role: true } } },
  });

  if (specialCollections.length === 0) return;

  const specialCollectionIds = specialCollections.map((c) => c.id);

  // Пользователи, у которых есть хотя бы 1 обязательство (они уже помогали)
  // но нет уведомления о специальных сборах
  const usersWithObligations = await db.obligation.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });

  if (usersWithObligations.length === 0) return;

  const userIds = usersWithObligations.map((o) => o.userId);

  // Из них — те, кто ещё не получал уведомление о специальных сборах
  const alreadyNotified = await db.notification.findMany({
    where: {
      collectionId: { in: specialCollectionIds },
      userId: { in: userIds },
    },
    select: { userId: true, collectionId: true },
  });

  const notifiedSet = new Set(alreadyNotified.map((n) => `${n.userId}:${n.collectionId}`));

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const uid of userIds) {
    for (const col of specialCollections) {
      if (notifiedSet.has(`${uid}:${col.id}`)) continue;

      const type = col.creator.role === 'AUTHOR' ? 'SPECIAL_AUTHOR' : 'SPECIAL_DEVELOPER';
      try {
        await db.notification.upsert({
          where: {
            userId_collectionId_wave: { userId: uid, collectionId: col.id, wave: 0 },
          },
          create: {
            userId: uid,
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
