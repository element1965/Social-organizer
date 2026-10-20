import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS, REGULAR_CYCLE_DAYS } from '@so/shared';
import { findRecipientsViaBfs } from './bfs.service.js';
import { sendTgMessages, type TgReplyMarkup } from './telegram-bot.service.js';
import type { TgBroadcastMessage } from '../workers/tg-broadcast.worker.js';
import { sendPushNotification } from './push.service.js';

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

  if (created > 0) {
    const recipientIds = recipients.map((r) => r.userId);

    if (type === 'NEW_COLLECTION') {
      dispatchNewCollectionTg(db, collectionId, creatorId, recipientIds).catch((err) =>
        console.error('[TG Notify] Failed to dispatch:', err),
      );
      sendPushNotification(db, recipientIds, {
        title: 'New Collection',
        body: 'Someone in your network needs support.',
        url: `${WEB_APP_URL}/collection/${collectionId}`,
      }).catch((err) => console.error('[WebPush] Failed:', err));
    } else if (type === 'RE_NOTIFY') {
      dispatchNewCollectionTg(db, collectionId, creatorId, recipientIds).catch((err) =>
        console.error('[TG ReNotify] Failed to dispatch:', err),
      );
      sendPushNotification(db, recipientIds, {
        title: 'Reminder',
        body: 'A collection in your network still needs support.',
        url: `${WEB_APP_URL}/collection/${collectionId}`,
      }).catch((err) => console.error('[WebPush ReNotify] Failed:', err));
    }
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

  // Web Push in parallel
  sendPushNotification(db, recipientUserIds, {
    title: 'Collection Closed',
    body: 'A collection has been closed by its creator.',
    url: `${WEB_APP_URL}/collection/${collectionId}`,
  }).catch((err) => console.error('[WebPush] Failed:', err));

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

/**
 * Send Telegram notifications when a collection is blocked (goal reached).
 */
export async function sendCollectionBlockedTg(
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
  // Also notify the creator
  recipientUserIds.push(creatorId);
  if (recipientUserIds.length === 0) return;

  // Web Push in parallel
  sendPushNotification(db, recipientUserIds, {
    title: 'Collection Goal Reached',
    body: 'A collection has reached its target amount.',
    url: `${WEB_APP_URL}/collection/${collectionId}`,
  }).catch((err) => console.error('[WebPush] Failed:', err));

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
    const text = `🎯 <b>${tg(lang, 'blocked')}</b>\n\n${tg(lang, 'from')}: <b>${creator.name}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'blockedBody')}`;
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

/**
 * Send TG notification only to the collection creator when goal is reached.
 * Participants are NOT notified here — they will be notified when the creator manually closes.
 */
export async function sendGoalReachedToCreator(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
): Promise<void> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { amount: true, currency: true, originalAmount: true, originalCurrency: true, chatLink: true },
  });
  if (!collection) return;

  const amount = collection.originalAmount ?? collection.amount;
  const currency = collection.originalCurrency ?? collection.currency;
  const amountStr = amount != null ? `${amount} ${currency}` : '';
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  // Web Push to creator
  sendPushNotification(db, [creatorId], {
    title: 'Goal Reached',
    body: amountStr ? `Collection reached ${amountStr}` : 'Your collection reached its goal!',
    url: webAppLink,
  }).catch((err) => console.error('[WebPush GoalReached] Failed:', err));

  // TG notification
  const tgAccount = await db.platformAccount.findFirst({
    where: { userId: creatorId, platform: 'TELEGRAM' },
    select: { platformId: true, user: { select: { language: true } } },
  });
  if (!tgAccount) return;

  const lang = tgAccount.user?.language || 'en';
  const text = `🎯 <b>${tg(lang, 'blocked')}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'blockedBody')}`;

  const buttons: Array<Array<{ text: string; web_app?: { url: string }; url?: string }>> = [];
  if (collection.chatLink) {
    buttons.push([{ text: `💬 ${tg(lang, 'open')}`, url: collection.chatLink }]);
  }
  buttons.push([{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]);

  await sendTgMessages([{
    telegramId: tgAccount.platformId,
    text,
    replyMarkup: { inline_keyboard: buttons } as TgReplyMarkup,
  }]);
}

/**
 * Send notification for pending connections (new request, accepted, rejected).
 * Sends both TG bot message and Web Push.
 */
export async function sendPendingNotification(
  db: PrismaClient,
  recipientUserId: string,
  type: 'new' | 'accepted' | 'rejected',
  actorName: string,
  actorTgUsername?: string,
): Promise<void> {
  // Web Push
  const pushTitle = type === 'new' ? 'New connection request'
    : type === 'accepted' ? 'Request accepted'
    : 'Request declined';
  const pushBody = type === 'new' ? `${actorName} wants to connect`
    : actorName;
  const pushUrl = type === 'new' ? `${WEB_APP_URL}/notifications`
    : type === 'accepted' ? `${WEB_APP_URL}/network`
    : undefined;
  sendPushNotification(db, [recipientUserId], { title: pushTitle, body: pushBody, url: pushUrl })
    .catch((err) => console.error('[WebPush Pending] Failed:', err));

  // TG notification
  const tgAccount = await db.platformAccount.findFirst({
    where: { userId: recipientUserId, platform: 'TELEGRAM' },
    select: { platformId: true, user: { select: { language: true } } },
  });
  if (!tgAccount) return;

  const lang = tgAccount.user?.language || 'en';
  let text: string;
  let replyMarkup: TgReplyMarkup | undefined;
  const notificationsUrl = `${WEB_APP_URL}/notifications`;

  if (type === 'new') {
    const title = tg(lang, 'pendingNew') || 'New connection request';
    const body = (tg(lang, 'pendingNewBody') || '{{name}} wants to connect').replace('{{name}}', actorName);
    const tgLine = actorTgUsername ? `\n@${actorTgUsername}` : '';
    text = `🔔 <b>${title}</b>\n\n${body}${tgLine}`;
    replyMarkup = {
      inline_keyboard: [[{ text: `📱 ${tg(lang, 'pendingView') || 'View'}`, web_app: { url: notificationsUrl } }]],
    };
  } else if (type === 'accepted') {
    const title = tg(lang, 'pendingAccepted') || 'Request accepted';
    text = `✅ <b>${title}</b>\n\n${actorName}`;
    replyMarkup = {
      inline_keyboard: [[{ text: `📱 ${tg(lang, 'open') || 'Open'}`, web_app: { url: `${WEB_APP_URL}/network` } }]],
    };
  } else {
    const title = tg(lang, 'pendingRejected') || 'Request declined';
    text = `❌ <b>${title}</b>\n\n${actorName}`;
  }

  await sendTgMessages([{ telegramId: tgAccount.platformId, text, replyMarkup }]);
}

/**
 * Send notification to the inviter when a user from their first circle deletes their account.
 * Sends both TG bot message and Web Push.
 */
export async function sendUserDeletedNotification(
  db: PrismaClient,
  inviterUserId: string,
  deletedUserName: string,
): Promise<void> {
  // Web Push
  sendPushNotification(db, [inviterUserId], {
    title: 'User left',
    body: `${deletedUserName} has deleted their account.`,
    url: `${WEB_APP_URL}/network`,
  }).catch((err) => console.error('[WebPush UserDeleted] Failed:', err));

  // TG notification
  const tgAccount = await db.platformAccount.findFirst({
    where: { userId: inviterUserId, platform: 'TELEGRAM' },
    select: { platformId: true, user: { select: { language: true } } },
  });
  if (!tgAccount) return;

  const lang = tgAccount.user?.language || 'en';
  const title = tg(lang, 'userDeleted') || 'User left';
  const body = (tg(lang, 'userDeletedBody') || '{{name}} from your first circle has deleted their account.')
    .replace('{{name}}', deletedUserName);
  const text = `👋 <b>${title}</b>\n\n${body}`;

  await sendTgMessages([{ telegramId: tgAccount.platformId, text }]);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Format a date for a given UI language, e.g. 12.11.2026 */
function formatDate(d: Date, lang: string): string {
  try {
    return d.toLocaleDateString(lang, { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

/**
 * Per-user contribution to a regular collection (active subscriptions only).
 * Shown in the participant's own currency when all their obligations share one,
 * otherwise in USD (obligation.amount is stored in USD).
 */
async function getUserContributions(
  db: PrismaClient,
  collectionId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const obligations = await db.obligation.findMany({
    where: { collectionId, userId: { in: userIds }, unsubscribedAt: null },
    select: { userId: true, amount: true, originalAmount: true, originalCurrency: true },
  });
  const byUser = new Map<string, typeof obligations>();
  for (const o of obligations) {
    const list = byUser.get(o.userId) ?? [];
    list.push(o);
    byUser.set(o.userId, list);
  }
  const result = new Map<string, string>();
  for (const [userId, list] of byUser) {
    const currencies = new Set(list.map((o) => o.originalCurrency ?? 'USD'));
    const round = (n: number) => Math.round(n * 100) / 100;
    if (currencies.size === 1) {
      const cur = [...currencies][0]!;
      const sum = list.reduce((s, o) => s + (o.originalAmount ?? o.amount), 0);
      result.set(userId, `${round(sum)} ${cur}`);
    } else {
      result.set(userId, `${round(list.reduce((s, o) => s + o.amount, 0))} USD`);
    }
  }
  return result;
}

/** "Your contribution: X\nPeriod: a — b" block for cycle notifications */
function cycleDetails(lang: string, contribution: string | undefined, start: Date, end: Date): string {
  const lines: string[] = [];
  if (contribution) lines.push(`${tg(lang, 'yourContribution')}: <b>${contribution}</b>`);
  lines.push(`${tg(lang, 'period')}: ${formatDate(start, lang)} — ${formatDate(end, lang)}`);
  return `\n\n${lines.join('\n')}`;
}

/**
 * Send "renewal reminder" notification (3 days before next cycle) via TG and push.
 * In-app Notification rows are created separately by the worker so we can apply
 * the unique (userId, collectionId, type, wave) constraint for deduplication.
 */
export async function sendCycleRenewalReminderTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { currentCycleStart: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator) return;

  // The reminder is about the NEXT cycle: it starts when the current one ends.
  const cycleStart = collection.currentCycleStart ?? new Date();
  const periodStart = new Date(cycleStart.getTime() + REGULAR_CYCLE_DAYS * DAY_MS);
  const periodEnd = new Date(periodStart.getTime() + REGULAR_CYCLE_DAYS * DAY_MS);
  const contributions = await getUserContributions(db, collectionId, recipientUserIds);
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  // Push (web + native) — one per user so each sees their own contribution
  for (const userId of recipientUserIds) {
    const c = contributions.get(userId);
    sendPushNotification(db, [userId], {
      title: 'Cycle renewal reminder',
      body: `In 3 days a new cycle starts for ${creator.name}'s regular support.${c ? ` Your contribution: ${c}.` : ''} Period: ${formatDate(periodStart, 'en')} — ${formatDate(periodEnd, 'en')}.`,
      url: webAppLink,
    }).catch((err) => console.error('[Push RenewalReminder] Failed:', err));
  }

  // Telegram
  const tgAccounts = await db.platformAccount.findMany({
    where: { userId: { in: recipientUserIds }, platform: 'TELEGRAM' },
    select: { platformId: true, userId: true, user: { select: { name: true, language: true } } },
  });
  if (tgAccounts.length === 0) return;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const lang = acc.user?.language || 'en';
    const userName = acc.user?.name || '';
    const title = tg(lang, 'renewalReminderTitle');
    const body = tg(lang, 'renewalReminderBody')
      .replace('{{name}}', userName)
      .replace('{{creator}}', creator.name);
    const text = `🔔 <b>${title}</b>\n\n${body}${cycleDetails(lang, contributions.get(acc.userId), periodStart, periodEnd)}`;
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

/**
 * Send "cycle renewed" notification (cycle just started) via TG and push.
 */
export async function sendCycleRenewedTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  if (recipientUserIds.length === 0) return;

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { chatLink: true, currentCycleStart: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator) return;

  // Called right after the cycle was rolled over, so currentCycleStart is the new cycle.
  const periodStart = collection.currentCycleStart ?? new Date();
  const periodEnd = new Date(periodStart.getTime() + REGULAR_CYCLE_DAYS * DAY_MS);
  const contributions = await getUserContributions(db, collectionId, recipientUserIds);
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  // Push — one per user so each sees their own contribution
  for (const userId of recipientUserIds) {
    const c = contributions.get(userId);
    sendPushNotification(db, [userId], {
      title: 'New cycle started',
      body: `A new support cycle for ${creator.name} has started.${c ? ` Your contribution: ${c}.` : ''} Period: ${formatDate(periodStart, 'en')} — ${formatDate(periodEnd, 'en')}.`,
      url: webAppLink,
    }).catch((err) => console.error('[Push CycleRenewed] Failed:', err));
  }

  // Telegram
  const tgAccounts = await db.platformAccount.findMany({
    where: { userId: { in: recipientUserIds }, platform: 'TELEGRAM' },
    select: { platformId: true, userId: true, user: { select: { name: true, language: true } } },
  });
  if (tgAccounts.length === 0) return;

  const messages: TgBroadcastMessage[] = tgAccounts.map((acc) => {
    const lang = acc.user?.language || 'en';
    const userName = acc.user?.name || '';
    const title = tg(lang, 'renewalStartTitle');
    const body = tg(lang, 'renewalStartBody')
      .replace('{{name}}', userName)
      .replace('{{creator}}', creator.name);
    const text = `🔁 <b>${title}</b>\n\n${body}${cycleDetails(lang, contributions.get(acc.userId), periodStart, periodEnd)}`;

    const buttons: Array<Array<{ text: string; web_app?: { url: string }; url?: string }>> = [];
    if (collection.chatLink) {
      buttons.push([{ text: `💬 ${tg(lang, 'open')}`, url: collection.chatLink }]);
    }
    buttons.push([{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]);

    return {
      telegramId: acc.platformId,
      text,
      replyMarkup: { inline_keyboard: buttons } as TgReplyMarkup,
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

