import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS, REGULAR_CYCLE_DAYS } from '@so/shared';
import { findRecipientsViaBfs, type BfsRecipient } from './bfs.service.js';
import { planWave, recordSent } from './notify-routing.service.js';
import type { TgReplyMarkup } from './telegram-bot.service.js';
import { deliver, deliverMany } from './delivery.service.js';
import { tgEscape } from './tg-html.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/** People written per insert when a wave is stored. */
const INSERT_BATCH = 1000;

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
export function tg(lang: string, key: string): string {
  const loc = loadTgBot(lang);
  return loc[key] ?? loadTgBot('en')[key] ?? key;
}

/**
 * Send collection notifications via BFS traversal of connection graph.
 * External messages: one per person, through their own channel (SO-45). A person hears about a collection
 * once — a later wave (RE_NOTIFY) only reaches people who were not notified yet, and the shared event key
 * stops a repeat. People who switched off new collections get the in-app entry only.
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

  // Requests for help are routed by behaviour (notify-routing.service): the wave budget counts only external
  // messages, and people who should not get one now get the in-app entry without taking a slot.
  // Other types keep the plain nearest-first walk.
  const isRequest = type === 'NEW_COLLECTION' || type === 'RE_NOTIFY';
  let recipients: BfsRecipient[];
  let external: BfsRecipient[];
  if (isRequest) {
    const reach = await findRecipientsViaBfs(db, creatorId, undefined, Infinity, [...ignoredUserIds]);
    const plan = await planWave(db, reach, maxRecipients ?? reach.length);
    recipients = [...plan.external, ...plan.inApp];
    external = plan.external;
  } else {
    recipients = await findRecipientsViaBfs(db, creatorId, undefined, maxRecipients, [...ignoredUserIds]);
    external = recipients;
  }
  if (recipients.length === 0) return 0;

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  // One insert per batch instead of one round trip per person: a wave can reach thousands of people.
  // Rows that already exist (a retried wave) are skipped by the unique key and still count as told.
  let created = 0;
  for (let i = 0; i < recipients.length; i += INSERT_BATCH) {
    const batch = recipients.slice(i, i + INSERT_BATCH);
    try {
      await db.notification.createMany({
        data: batch.map((recipient) => ({
          userId: recipient.userId, collectionId, type,
          handshakePath: recipient.path, expiresAt, wave,
        })),
        skipDuplicates: true,
      });
      created += batch.length;
    } catch (err) {
      console.error('[Notify] wave batch failed:', err);
    }
  }

  if (created > 0 && isRequest && external.length > 0) {
    dispatchNewCollection(db, collectionId, creatorId, external.map((r) => r.userId), type).catch((err) =>
      console.error('[Notify] new collection dispatch failed:', err),
    );
  }

  return created;
}

/**
 * Collection closed by its author: one message to everyone who was notified about it.
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

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  const collection = await db.collection.findUnique({ where: { id: collectionId }, select: { amount: true } });
  if (!creator || !collection) return;

  const amountStr = collection.amount != null ? `${collection.amount} USD` : ''; // 1 unit = 1 $ (SO-40)
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, () => ({
    key: `col:${collectionId}:closed`,
    kind: 'collection',
    push: { title: 'Need closed', body: 'A Need you were notified about has been closed.', url: webAppLink },
    telegram: (lang) => ({
      text: `✅ <b>${tg(lang, 'closed')}</b>\n\n${tg(lang, 'from')}: <b>${tgEscape(creator.name)}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'closedBody')}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]] },
    }),
  }));
}

/**
 * Goal reached: one message to the author only. Participants hear about it when the author closes the collection.
 * Called from several places (intention, amount change, block check): the key stops a second message.
 */
export async function sendGoalReachedToCreator(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
): Promise<void> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { amount: true, chatLink: true, blockedAt: true, cycleNumber: true },
  });
  if (!collection) return;

  const amountStr = collection.amount != null ? `${collection.amount} USD` : '';
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;
  const stamp = collection.blockedAt ? collection.blockedAt.getTime() : `c${collection.cycleNumber}`;

  await deliver(db, creatorId, {
    key: `goal:${collectionId}:${stamp}`,
    kind: 'response',
    push: { title: 'Amount reported', body: 'Participation reported in your Need has reached the amount needed.', url: webAppLink },
    telegram: (lang) => {
      const buttons: TgReplyMarkup['inline_keyboard'] = [];
      if (collection.chatLink) buttons.push([{ text: `💬 ${tg(lang, 'open')}`, url: collection.chatLink }]);
      buttons.push([{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]);
      return {
        text: `🎯 <b>${tg(lang, 'blocked')}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'blockedBody')}`,
        replyMarkup: { inline_keyboard: buttons },
      };
    },
  });
}

/**
 * Personal connection request and its answer. A request is announced once (no reminders for silence);
 * it stays in the app until answered. In Telegram it can be answered right in the message.
 */
export async function sendPendingNotification(
  db: PrismaClient,
  recipientUserId: string,
  type: 'new' | 'accepted' | 'rejected',
  actorName: string,
  actorTgUsername?: string,
  pendingId?: string,
): Promise<void> {
  const notificationsUrl = `${WEB_APP_URL}/notifications`;
  const dashboardUrl = `${WEB_APP_URL}/dashboard`;
  // Without a request id (old callers) the key falls back to the name and the day
  const ref = pendingId ?? `${actorName}:${new Date().toISOString().slice(0, 10)}`;

  if (type === 'new') {
    await deliver(db, recipientUserId, {
      key: `req:${ref}`,
      kind: 'request',
      push: { title: 'New connection request', body: 'Someone wants to connect with you. Open the app to answer.', url: notificationsUrl },
      telegram: (lang) => {
        const title = tg(lang, 'pendingNew') || 'New connection request';
        const body = (tg(lang, 'pendingNewBody') || '{{name}} wants to connect').replace('{{name}}', tgEscape(actorName));
        const tgLine = actorTgUsername ? `\n@${actorTgUsername}` : '';
        const rows: TgReplyMarkup['inline_keyboard'] = [];
        if (pendingId) {
          // Answer right in the bot: same server record as in the app (connection-request.service)
          rows.push([
            { text: `✅ ${tg(lang, 'pendingAcceptBtn')}`, callback_data: `pc_a:${pendingId}` },
            { text: `✖️ ${tg(lang, 'pendingRejectBtn')}`, callback_data: `pc_r:${pendingId}` },
          ]);
        }
        rows.push([{ text: `📱 ${tg(lang, 'pendingView') || 'View'}`, web_app: { url: notificationsUrl } }]);
        return { text: `🔔 <b>${title}</b>\n\n${body}${tgLine}`, replyMarkup: { inline_keyboard: rows } };
      },
    });
    return;
  }

  const accepted = type === 'accepted';
  await deliver(db, recipientUserId, {
    key: `reqans:${ref}`,
    kind: 'requestAnswer',
    push: accepted
      ? { title: 'Request accepted', body: 'Your connection request was accepted.', url: dashboardUrl }
      : { title: 'Request declined', body: 'Your connection request was declined.', url: dashboardUrl },
    telegram: (lang) => ({
      text: accepted
        ? `✅ <b>${tg(lang, 'pendingAccepted') || 'Request accepted'}</b>\n\n${tgEscape(actorName)}`
        : `❌ <b>${tg(lang, 'pendingRejected') || 'Request declined'}</b>\n\n${tgEscape(actorName)}\n\n${tg(lang, 'pendingRejectedNext')}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'open') || 'Open'}`, web_app: { url: dashboardUrl } }]] },
    }),
  });
}

/**
 * A person from the inviter's 1st handshake deleted their account: one message to the inviter.
 */
export async function sendUserDeletedNotification(
  db: PrismaClient,
  inviterUserId: string,
  deletedUserName: string,
  deletedUserId?: string,
): Promise<void> {
  await deliver(db, inviterUserId, {
    key: `left:${deletedUserId ?? deletedUserName}`,
    kind: 'network',
    push: { title: 'Someone left', body: 'A person from your 1st handshake deleted their account.', url: `${WEB_APP_URL}/network` },
    telegram: (lang) => ({
      text: `👋 <b>${tg(lang, 'userDeleted') || 'User left'}</b>\n\n${(tg(lang, 'userDeletedBody') || '{{name}} from your 1st handshake deleted their account.').replace('{{name}}', tgEscape(deletedUserName))}`,
    }),
  });
}

/**
 * Responses to the author's collection, grouped (SO-45): one message for all intentions that came after
 * the last message to the author and that the author has not seen yet (opening the collection counts as seen).
 * Nothing is sent once the collection is no longer active. Called with a delay after an intention
 * (see scheduleResponseDigest), so close-in-time responses arrive as one message.
 */
export async function sendResponseDigest(
  db: PrismaClient,
  collectionId: string,
): Promise<'sent' | 'nothing' | 'duplicate' | 'inactive'> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { creatorId: true, status: true, creatorViewedAt: true },
  });
  if (!collection) return 'nothing';
  if (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED') return 'inactive';

  // Only responses newer than the last digest and newer than the author's last visit count
  const lastDigest = await db.notificationDelivery.findFirst({
    where: { userId: collection.creatorId, eventKey: { startsWith: `resp:${collectionId}:` } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  const marks = [lastDigest?.createdAt, collection.creatorViewedAt].filter((d): d is Date => !!d);
  const since = marks.length ? new Date(Math.max(...marks.map((d) => d.getTime()))) : undefined;

  const fresh = await db.obligation.findMany({
    where: { collectionId, userId: { not: collection.creatorId }, ...(since ? { createdAt: { gt: since } } : {}) },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  });
  if (fresh.length === 0) return 'nothing';

  const count = fresh.length;
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;
  const outcome = await deliver(db, collection.creatorId, {
    key: `resp:${collectionId}:${fresh[0]!.id}`,
    kind: 'response',
    push: { title: 'New Participation', body: 'People reported Participation in your Need. Open the app to see them.', url: webAppLink },
    telegram: (lang) => ({
      text: `🤝 <b>${tg(lang, 'responsesTitle')}</b>\n\n${tg(lang, 'responsesBody').replace('{{count}}', String(count))}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]] },
    }),
  });
  return outcome === 'sent' ? 'sent' : outcome === 'duplicate' ? 'duplicate' : 'nothing';
}

/** Window in which responses to one collection are grouped into one message */
export const RESPONSE_DIGEST_DELAY_MS = 5 * 60 * 1000;

const pendingDigests = new Map<string, NodeJS.Timeout>();

/**
 * Plans one grouped message about responses: the first intention opens the window, the following ones in
 * the same window join it. With Redis the delayed job survives a restart (one job id per collection);
 * without Redis an in-process timer is used.
 */
export async function scheduleResponseDigest(db: PrismaClient, collectionId: string): Promise<void> {
  try {
    const { enqueueResponseDigest } = await import('../workers/index.js');
    if (await enqueueResponseDigest(collectionId, RESPONSE_DIGEST_DELAY_MS)) return;
  } catch { /* no queue — fall back to a timer */ }
  if (pendingDigests.has(collectionId)) return;
  const timer = setTimeout(() => {
    pendingDigests.delete(collectionId);
    sendResponseDigest(db, collectionId).catch((err) => console.error('[Notify] response digest failed:', err));
  }, RESPONSE_DIGEST_DELAY_MS);
  timer.unref?.();
  pendingDigests.set(collectionId, timer);
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
 * Always in $ (one unit of participation), obligation.amount is stored in $.
 */
async function getUserContributions(
  db: PrismaClient,
  collectionId: string,
  userIds: string[],
): Promise<Map<string, string>> {
  const obligations = await db.obligation.findMany({
    where: { collectionId, userId: { in: userIds }, unsubscribedAt: null },
    select: { userId: true, amount: true },
  });
  const sums = new Map<string, number>();
  for (const o of obligations) sums.set(o.userId, (sums.get(o.userId) ?? 0) + o.amount);
  const result = new Map<string, string>();
  for (const [userId, sum] of sums) result.set(userId, `${Math.round(sum * 100) / 100} USD`);
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
 * "Renewal reminder" (3 days before the next cycle of regular help, SO-1). The worker creates the in-app rows
 * and passes only people with the reminder switched on; one external message per person and cycle.
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
    select: { currentCycleStart: true, cycleNumber: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator) return;

  // The reminder is about the NEXT cycle: it starts when the current one ends.
  const cycleStart = collection.currentCycleStart ?? new Date();
  const periodStart = new Date(cycleStart.getTime() + REGULAR_CYCLE_DAYS * DAY_MS);
  const periodEnd = new Date(periodStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY_MS); // last day of the cycle
  const contributions = await getUserContributions(db, collectionId, recipientUserIds);
  const names = await userNames(db, recipientUserIds);
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, (userId) => ({
    key: `cycle:${collectionId}:${collection.cycleNumber}:reminder`,
    kind: 'cycle',
    push: { title: 'New cycle in 3 days', body: 'A Need you take part in (every 28 days) starts a new cycle in 3 days.', url: webAppLink },
    telegram: (lang) => ({
      text: `🔔 <b>${tg(lang, 'renewalReminderTitle')}</b>\n\n${tg(lang, 'renewalReminderBody').replace('{{name}}', tgEscape(names.get(userId))).replace('{{creator}}', tgEscape(creator.name))}${cycleDetails(lang, contributions.get(userId), periodStart, periodEnd)}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'open')}`, web_app: { url: webAppLink } }]] },
    }),
  }));
}

/**
 * "Cycle renewed" (a new cycle of regular help just started, SO-1): one external message per person and cycle.
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
    select: { chatLink: true, currentCycleStart: true, cycleNumber: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator) return;

  // Called right after the cycle was rolled over, so currentCycleStart is the new cycle.
  const periodStart = collection.currentCycleStart ?? new Date();
  const periodEnd = new Date(periodStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY_MS); // last day of the cycle
  const contributions = await getUserContributions(db, collectionId, recipientUserIds);
  const names = await userNames(db, recipientUserIds);
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, (userId) => ({
    key: `cycle:${collectionId}:${collection.cycleNumber}:start`,
    kind: 'cycle',
    push: { title: 'New cycle started', body: 'A Need you take part in (every 28 days) has started a new cycle.', url: webAppLink },
    telegram: (lang) => {
      const buttons: TgReplyMarkup['inline_keyboard'] = [];
      if (collection.chatLink) buttons.push([{ text: `💬 ${tg(lang, 'open')}`, url: collection.chatLink }]);
      buttons.push([{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]);
      return {
        text: `🔁 <b>${tg(lang, 'renewalStartTitle')}</b>\n\n${tg(lang, 'renewalStartBody').replace('{{name}}', tgEscape(names.get(userId))).replace('{{creator}}', tgEscape(creator.name))}${cycleDetails(lang, contributions.get(userId), periodStart, periodEnd)}`,
        replyMarkup: { inline_keyboard: buttons },
      };
    },
  }));
}

async function userNames(db: PrismaClient, ids: string[]): Promise<Map<string, string>> {
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** New collection (or a later wave): one message per person, through their own channel */
async function dispatchNewCollection(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
  type: 'NEW_COLLECTION' | 'RE_NOTIFY',
): Promise<void> {
  const collection = await db.collection.findUnique({ where: { id: collectionId }, select: { type: true, amount: true } });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator) return;

  const isEmergency = collection.type === 'EMERGENCY';
  const amountStr = collection.amount != null ? `${collection.amount} USD` : '';
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;
  const push = type === 'RE_NOTIFY'
    ? { title: 'Reminder', body: 'A Need in your network is still open.', url: webAppLink }
    : { title: 'New Need', body: 'Someone in your network has reported a Need.', url: webAppLink };

  const outcomes = await deliverMany(db, recipientUserIds, () => ({
    key: `col:${collectionId}:new`, // one message per person per collection, whatever the wave
    kind: 'newCollection',
    push,
    telegram: (lang) => ({
      text: `${isEmergency ? '🚨' : '📢'} <b>${isEmergency ? tg(lang, 'newEmergency') : tg(lang, 'newRegular')}</b>\n\n${tg(lang, 'from')}: <b>${tgEscape(creator.name)}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'networkSupport')}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'open')}`, web_app: { url: webAppLink } }]] },
    }),
  }));
  const counts: Record<string, number> = {};
  for (const o of outcomes.values()) counts[o] = (counts[o] ?? 0) + 1;
  console.log(`[Notify] collection ${collectionId} ${type}:`, counts);
  const delivered = [...outcomes.entries()].filter(([, o]) => o === 'sent').map(([id]) => id);
  await recordSent(db, delivered).catch((err) => console.error('[Notify] stats not recorded:', err));
}
