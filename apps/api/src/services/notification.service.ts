import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { findRecipientsViaBfs } from './bfs.service.js';

/**
 * Рассылка уведомлений о сборе через BFS-обход графа связей.
 * Количество получателей = maxRecipients (по умолчанию amount / NOTIFICATION_RATIO).
 */
export async function sendCollectionNotifications(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  type: 'NEW_COLLECTION' | 'RE_NOTIFY' | 'COLLECTION_BLOCKED' | 'COLLECTION_CLOSED',
  wave: number = 1,
  maxRecipients?: number,
): Promise<number> {
  // Получить ignore-список создателя (те, кого он игнорирует, и те, кто его игнорирует)
  const ignoreEntries = await db.ignoreEntry.findMany({
    where: {
      OR: [{ fromUserId: creatorId }, { toUserId: creatorId }],
    },
    select: { fromUserId: true, toUserId: true },
  });
  const ignoredUserIds = new Set<string>();
  for (const entry of ignoreEntries) {
    ignoredUserIds.add(entry.fromUserId === creatorId ? entry.toUserId : entry.fromUserId);
  }

  // Также исключаем тех, кто уже получал уведомление о данном сборе
  const alreadyNotified = await db.notification.findMany({
    where: { collectionId },
    select: { userId: true },
    distinct: ['userId'],
  });
  for (const n of alreadyNotified) {
    ignoredUserIds.add(n.userId);
  }

  const recipients = await findRecipientsViaBfs(db, creatorId, undefined, maxRecipients, [...ignoredUserIds]);

  if (recipients.length === 0) return 0;

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  // Массовая вставка с upsert (по unique [userId, collectionId, wave])
  let created = 0;
  for (const recipient of recipients) {
    try {
      await db.notification.upsert({
        where: {
          userId_collectionId_type_wave: {
            userId: recipient.userId,
            collectionId,
            type,
            wave,
          },
        },
        create: {
          userId: recipient.userId,
          collectionId,
          type,
          handshakePath: recipient.path,
          expiresAt,
          wave,
        },
        update: {},
      });
      created++;
    } catch {
      // Пропускаем ошибки (напр. внешний ключ если пользователь удалён)
    }
  }

  return created;
}
