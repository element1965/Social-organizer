import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { findRecipientsViaBfs } from './bfs.service.js';
import { sendTelegramMessage, type TgReplyMarkup } from './telegram-bot.service.js';
import { enqueueTgBroadcast } from '../workers/index.js';
import type { TgBroadcastMessage } from '../workers/tg-broadcast.worker.js';

const DIRECT_SEND_THRESHOLD = 25;
const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/* Load locale JSON files via createRequire (avoids Node 18 ESM JSON import assertion issue) */
const _require = createRequire(import.meta.url);
const i18nDir = resolve(dirname(_require.resolve('@so/i18n')), '..');
const localeCache = new Map<string, Record<string, string>>();

function loadTgBot(lang: string): Record<string, string> {
  if (localeCache.has(lang)) return localeCache.get(lang)!;
  try {
    const data = _require(resolve(i18nDir, 'locales', `${lang}.json`));
    const tgBot = data.tgBot ?? {};
    localeCache.set(lang, tgBot);
    return tgBot;
  } catch {
    return loadTgBot('en');
  }
}

/** Get tgBot translation for a given language, fallback to English */
function tg(lang: string, key: string): string {
  const loc = loadTgBot(lang);
  return loc[key] ?? loadTgBot('en')[key] ?? key;
}

/**
 * Send collection notifications via BFS traversal of connection graph.
 */
export async function sendCollectionNotifications(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  type: 'NEW_COLLECTION' | 'RE_NOTIFY' | 'COLLECTION_BLOCKED' | 'COLLECTION_CLOSED',
  wave: number = 1,
  maxRecipients?: number,
): Promise<number> {
  const ignoreEntries = await db.ignoreEntry.findMany({
    where: { OR: [{ fromUserId: creatorId }, { toUserId: creatorId }] },
    select: { fromUserId: true, toUserId: true },
  });
  const ignoredUserIds = new Set<string>();
  for (const entry of ignoreEntries) {
    ignoredUserIds.add(entry.fromUserId === creatorId ? entry.toUserId : entry.fromUserId);
  }

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

  let created = 0;
  for (const recipient of recipients) {
    try {
      await db.notification.upsert({
        where: {
          userId_collectionId_type_wave: {
            userId: recipient.userId, collectionId, type, wave,
          },
        },
        create: {
          userId: recipient.userId, collectionId, type,
          handshakePath: recipient.path, expiresAt, wave,
        },
        update: {},
      });
      created++;
    } catch { /* skip */ }
  }

  if (type === 'NEW_COLLECTION' && created > 0) {
    dispatchNewCollectionTg(db, collectionId, creatorId, recipients.map((r) => r.userId)).catch((err) =>
      console.error('[TG Notify] Failed to dispatch:', err),
    );
  }

  return created;
}

/**
 * Send Telegram notifications when a collection is closed.
 */
export async function sendCollectionClosedTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
): Promise<void> {
  const notifiedUsers = await db.notification.findMany({
    where: { collectionId },
    select: { userId: true },
    distinct: ['userId'],
  });
  const recipientUserIds = notifiedUsers.map((n) => n.userId).filter((id) => id !== creatorId);
  if (recipientUserIds.length === 0) return;

  // Get TG accounts + user language
  const tgAccounts = await db.platformAccount.findMany({
    where: { userId: { in: recipientUserIds }, platform: 'TELEGRAM' },
    select: { platformId: true, user: { select: { language: true } } },
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
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const lang = acc.user?.language || 'en';
    const amountStr = amount != null ? `${amount} ${currency}` : '';
    const text = `✅ <b>${tg(lang, 'closed')}</b>\n\n${tg(lang, 'from')}: <b>${creator.name}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'closedBody')}`;
    return {
      telegramId: acc.platformId,
      text,
      replyMarkup: {
        inline_keyboard: [[{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]],
      } as TgReplyMarkup,
    };
  });

  await sendTgMessages(messages);
}

/** Send new collection Telegram notifications with per-user language */
async function dispatchNewCollectionTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  console.log(`[TG Notify] Starting dispatch for collection ${collectionId}, recipients: ${recipientUserIds.length}`);

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { type: true, amount: true, currency: true, originalAmount: true, originalCurrency: true },
  });
  if (!collection) return;

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!creator) return;

  // Get TG accounts + user language
  const tgAccounts = await db.platformAccount.findMany({
    where: { userId: { in: recipientUserIds }, platform: 'TELEGRAM' },
    select: { platformId: true, user: { select: { language: true } } },
  });
  if (tgAccounts.length === 0) return;

  const amount = collection.originalAmount ?? collection.amount;
  const currency = collection.originalCurrency ?? collection.currency;
  const isEmergency = collection.type === 'EMERGENCY';
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const lang = acc.user?.language || 'en';
    const emoji = isEmergency ? '🚨' : '📢';
    const title = isEmergency ? tg(lang, 'newEmergency') : tg(lang, 'newRegular');
    const amountStr = amount != null ? `${amount} ${currency}` : '';
    const text = `${emoji} <b>${title}</b>\n\n${tg(lang, 'from')}: <b>${creator.name}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'networkSupport')}`;
    return {
      telegramId: acc.platformId,
      text,
      replyMarkup: {
        inline_keyboard: [[{ text: `📱 ${tg(lang, 'open')}`, web_app: { url: webAppLink } }]],
      } as TgReplyMarkup,
    };
  });

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
