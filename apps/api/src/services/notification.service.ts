import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { findRecipientsViaBfs } from './bfs.service.js';
import { enqueueTgBroadcast } from '../workers/index.js';
import type { TgBroadcastMessage } from '../workers/tg-broadcast.worker.js';

/**
 * Send collection notifications via BFS traversal of connection graph.
 * Number of recipients = maxRecipients (default: amount / NOTIFICATION_RATIO).
 */
export async function sendCollectionNotifications(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  type: 'NEW_COLLECTION' | 'RE_NOTIFY' | 'COLLECTION_BLOCKED' | 'COLLECTION_CLOSED',
  wave: number = 1,
  maxRecipients?: number,
): Promise<number> {
  // Get creator's ignore list (those they ignore and those who ignore them)
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

  // Also exclude those who already received notification about this collection
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

  // Bulk insert with upsert (by unique [userId, collectionId, wave])
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
      // Skip errors (e.g. foreign key if user is deleted)
    }
  }

  // Send Telegram notifications for NEW_COLLECTION
  if (type === 'NEW_COLLECTION' && created > 0) {
    dispatchTelegramNotifications(db, collectionId, creatorId, recipients.map((r) => r.userId)).catch((err) =>
      console.error('[TG Notify] Failed to dispatch:', err),
    );
  }

  return created;
}

/** Find Telegram accounts of recipients and enqueue broadcast (non-blocking) */
async function dispatchTelegramNotifications(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  // Get collection info and creator name
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { type: true, amount: true, currency: true, originalAmount: true, originalCurrency: true },
  });
  if (!collection) return;

  const creator = await db.user.findUnique({
    where: { id: creatorId },
    select: { name: true },
  });
  if (!creator) return;

  // Find Telegram platform accounts for recipients
  const tgAccounts = await db.platformAccount.findMany({
    where: {
      userId: { in: recipientUserIds },
      platform: 'TELEGRAM',
    },
    select: { userId: true, platformId: true },
  });

  if (tgAccounts.length === 0) return;

  const amount = collection.originalAmount ?? collection.amount;
  const currency = collection.originalCurrency ?? collection.currency;
  const collectionType = collection.type as 'EMERGENCY' | 'REGULAR';

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const emoji = collectionType === 'EMERGENCY' ? '🚨' : '📢';
    const typeLabel = collectionType === 'EMERGENCY' ? 'Emergency' : 'Regular';
    const amountStr = amount != null ? `${amount} ${currency}` : 'open';
    const text = `${emoji} <b>New ${typeLabel} Collection</b>\n\nFrom: <b>${creator.name}</b>\nAmount: ${amountStr}\n\nSomeone in your network needs support.`;

    const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot';
    const deepLink = `https://t.me/${botUsername}?startapp=collection_${collectionId}`;

    return {
      telegramId: acc.platformId,
      text,
      replyMarkup: {
        inline_keyboard: [[{ text: '📱 Open', url: deepLink }]],
      },
    };
  });

  await enqueueTgBroadcast(messages);
  console.log(`[TG Notify] Enqueued ${messages.length} messages for collection ${collectionId}`);
}
