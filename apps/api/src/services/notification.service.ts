import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { findRecipientsViaBfs } from './bfs.service.js';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';
import { enqueueTgBroadcast } from '../workers/index.js';
import type { TgBroadcastMessage } from '../workers/tg-broadcast.worker.js';

const DIRECT_SEND_THRESHOLD = 25; // Send directly if fewer than 25 recipients

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

/**
 * Send Telegram notifications when a collection is closed.
 * Notifies all previously notified users who have Telegram accounts.
 */
export async function sendCollectionClosedTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
): Promise<void> {
  // Find all users who received notifications about this collection
  const notifiedUsers = await db.notification.findMany({
    where: { collectionId },
    select: { userId: true },
    distinct: ['userId'],
  });
  const recipientUserIds = notifiedUsers.map((n) => n.userId).filter((id) => id !== creatorId);
  if (recipientUserIds.length === 0) return;

  const tgAccounts = await db.platformAccount.findMany({
    where: { userId: { in: recipientUserIds }, platform: 'TELEGRAM' },
    select: { platformId: true },
  });
  if (tgAccounts.length === 0) return;

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { amount: true, currency: true, originalAmount: true, originalCurrency: true },
  });
  if (!creator || !collection) return;

  const amount = collection.originalAmount ?? collection.amount;
  const currency = collection.originalCurrency ?? collection.currency;
  const amountStr = amount != null ? `${amount} ${currency}` : '';
  const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot';
  const deepLink = `https://t.me/${botUsername}?startapp=collection_${collectionId}`;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => ({
    telegramId: acc.platformId,
    text: `✅ <b>Collection Closed</b>\n\nFrom: <b>${creator.name}</b>${amountStr ? `\nAmount: ${amountStr}` : ''}\n\nThe collection has been closed by its creator.`,
    replyMarkup: {
      inline_keyboard: [[{ text: '📱 View', url: deepLink }]],
    } as TgReplyMarkup,
  }));

  await sendTgMessages(messages);
}

/** Send an array of TG messages via direct send or BullMQ */
async function sendTgMessages(messages: TgBroadcastMessage[]): Promise<void> {
  if (messages.length === 0) return;

  if (messages.length <= DIRECT_SEND_THRESHOLD) {
    let sent = 0;
    let failed = 0;
    for (const msg of messages) {
      try {
        const ok = await sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup);
        if (ok) sent++; else failed++;
      } catch { failed++; }
    }
    console.log(`[TG] Direct send: sent=${sent}, failed=${failed}`);
    return;
  }

  try {
    await enqueueTgBroadcast(messages);
    console.log(`[TG] Enqueued ${messages.length} messages via BullMQ`);
  } catch (err) {
    console.error('[TG] BullMQ failed, fallback to direct:', err);
    let sent = 0;
    for (const msg of messages) {
      try {
        const ok = await sendTelegramMessage(msg.telegramId, msg.text, msg.replyMarkup);
        if (ok) sent++;
        if (sent % 25 === 0) await new Promise((r) => setTimeout(r, 1100));
      } catch { /* continue */ }
    }
    console.log(`[TG] Fallback: ${sent}/${messages.length}`);
  }
}

/** Find Telegram accounts of recipients and send notifications */
async function dispatchTelegramNotifications(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  console.log(`[TG Notify] Starting dispatch for collection ${collectionId}, recipients: ${recipientUserIds.length}`);

  // Get collection info and creator name
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { type: true, amount: true, currency: true, originalAmount: true, originalCurrency: true },
  });
  if (!collection) {
    console.warn('[TG Notify] Collection not found, skipping');
    return;
  }

  const creator = await db.user.findUnique({
    where: { id: creatorId },
    select: { name: true },
  });
  if (!creator) {
    console.warn('[TG Notify] Creator not found, skipping');
    return;
  }

  // Find Telegram platform accounts for recipients
  const tgAccounts = await db.platformAccount.findMany({
    where: {
      userId: { in: recipientUserIds },
      platform: 'TELEGRAM',
    },
    select: { userId: true, platformId: true },
  });

  console.log(`[TG Notify] Found ${tgAccounts.length} Telegram accounts out of ${recipientUserIds.length} recipients`);

  if (tgAccounts.length === 0) return;

  const amount = collection.originalAmount ?? collection.amount;
  const currency = collection.originalCurrency ?? collection.currency;
  const collectionType = collection.type as 'EMERGENCY' | 'REGULAR';
  const botUsername = process.env.VITE_TELEGRAM_BOT_USERNAME || 'socialorganizer_bot';
  const deepLink = `https://t.me/${botUsername}?startapp=collection_${collectionId}`;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const emoji = collectionType === 'EMERGENCY' ? '🚨' : '📢';
    const typeLabel = collectionType === 'EMERGENCY' ? 'Emergency' : 'Regular';
    const amountStr = amount != null ? `${amount} ${currency}` : 'open';
    const text = `${emoji} <b>New ${typeLabel} Collection</b>\n\nFrom: <b>${creator.name}</b>\nAmount: ${amountStr}\n\nSomeone in your network needs support.`;

    return {
      telegramId: acc.platformId,
      text,
      replyMarkup: {
        inline_keyboard: [[{ text: '📱 Open', url: deepLink }]],
      } as TgReplyMarkup,
    };
  });

  await sendTgMessages(messages);
}
