import { WEB_APP_URL } from '../deployment.js';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import type { Prisma, PrismaClient } from '@so/db';
import { groupNumber, NOTIFICATION_RATIO, NOTIFICATION_TTL_HOURS, REGULAR_CYCLE_DAYS } from '@so/shared';
import { findRecipientsViaBfs, walkRings, type BfsRecipient } from './bfs.service.js';
import { planWave } from './notify-routing.service.js';
import { timedWalk } from './runtime-metrics.service.js';
import type { TgReplyMarkup } from './telegram-bot.service.js';
import { deliver, deliverMany, requestPushPayload } from './delivery.service.js';
import { tgEscape } from './tg-html.js';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { findNeedForUpdate } from './collection-state.js';
import { activeObligationTotals } from './collection-amount.js';
import { enqueueNeedNotice, pendingNoticeKey, retirePendingNotices, type NeedNotice } from './need-delivery-state.js';


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

const REPEAT_CHECK_PREFIX = 'renotify:';
type DueRepeat = { createdAt: Date; cutoff: Date; now: Date };

export async function lastNeedWaveAt(
  db: Prisma.TransactionClient,
  { id, creatorId, createdAt }: { id: string; creatorId: string; createdAt: Date },
): Promise<Date> {
  const [entry, check] = await Promise.all([
    db.notification.findFirst({
      where: { collectionId: id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.notificationDelivery.findFirst({
      where: { userId: creatorId, eventKey: { startsWith: `${REPEAT_CHECK_PREFIX}${id}:` } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return new Date(Math.max(createdAt.getTime(), entry?.createdAt.getTime() ?? 0, check?.createdAt.getTime() ?? 0));
}

type WaveType = 'NEW_COLLECTION' | 'RE_NOTIFY' | 'COLLECTION_BLOCKED' | 'COLLECTION_CLOSED';

export function sendScheduledRepeatWave(
  db: PrismaClient, collectionId: string, creatorId: string, maxRecipients: number, due: DueRepeat,
): Promise<{ count: number; wave: number } | undefined> {
  return sendWave(db, collectionId, creatorId, 'RE_NOTIFY', 1, maxRecipients, due);
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
  type: WaveType,
  wave: number = 1,
  maxRecipients?: number,
): Promise<number> {
  return (await sendWave(db, collectionId, creatorId, type, wave, maxRecipients))?.count ?? 0;
}

async function sendWave(
  db: PrismaClient, collectionId: string, creatorId: string, type: WaveType,
  wave: number, maxRecipients?: number, due?: DueRepeat,
): Promise<{ count: number; wave: number } | undefined> {
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

  // The amount-based wave budget counts only external messages. People held back by the delivery rules
  // get an in-app entry without taking a slot. The walk uses the graph directly, including the outer rings.
  // Other types keep the plain nearest-first walk.
  const isRequest = type === 'NEW_COLLECTION' || type === 'RE_NOTIFY';
  let recipients: BfsRecipient[];
  let external: BfsRecipient[] = [];
  if (isRequest) {
    // Rings are walked one at a time and only while the budget lasts: a $300 Need in a network of a
    // million people stops in the 2nd–3rd ring instead of walking everyone up to the 6th handshake
    const plan = await timedWalk('wave', async () => {
      const rings = await walkRings(db, creatorId, undefined, ignoredUserIds);
      return planWave(db, rings, maxRecipients ?? Infinity);
    });
    recipients = [...plan.external, ...plan.inApp];
    external = plan.external;
  } else {
    recipients = await findRecipientsViaBfs(db, creatorId, undefined, maxRecipients, [...ignoredUserIds]);
  }
  if (recipients.length === 0 && !due) return;

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
  const data = recipients.map(({ userId, path }) => ({
    userId, collectionId, type, handshakePath: path, expiresAt, wave,
  }));
  const externalIds = new Set(external.map(({ userId }) => userId));

  if (!isRequest) {
    let count = 0;
    for (let i = 0; i < data.length; i += INSERT_BATCH) {
      try {
        count += (await db.notification.createMany({ data: data.slice(i, i + INSERT_BATCH), skipDuplicates: true })).count;
      } catch (err) {
        console.error('[Notify] wave batch failed:', err);
      }
    }
    return { count, wave };
  }

  const result = await transactionWithRetry(db, async (tx) => {
    const need = await findNeedForUpdate(tx, collectionId);
    if (!need || need.creatorId !== creatorId || need.status !== 'ACTIVE' || need.blockReason === 'COMMUNITY') return;
    if (need.amount == null || (due && (need.type !== 'EMERGENCY' || need.blockReason != null))) return;

    const { amount: pledged } = await activeObligationTotals(tx, collectionId);
    const budget = Math.min(maxRecipients ?? Infinity, Math.ceil((need.amount - pledged) / NOTIFICATION_RATIO));
    if (budget <= 0) return;

    let currentWave = wave;
    if (due) {
      if ((await lastNeedWaveAt(tx, { id: collectionId, creatorId, createdAt: due.createdAt })) > due.cutoff) return;
      const previous = await tx.notification.aggregate({
        where: { collectionId, type: 'RE_NOTIFY' },
        _max: { wave: true },
      });
      currentWave = (previous._max.wave ?? 0) + 1;
      // Claim even an empty wave. The marker, entries and delivery intents commit together.
      const checkedAt = new Date(Math.max(due.now.getTime(), Date.now()));
      await tx.notificationDelivery.create({
        data: { userId: creatorId, eventKey: `${REPEAT_CHECK_PREFIX}${collectionId}:${checkedAt.getTime()}`, channel: 'APP', createdAt: checkedAt },
      });
    } else if (type === 'NEW_COLLECTION' && await tx.notification.findFirst({
      where: { collectionId, type, wave },
      select: { id: true },
    })) {
      return;
    }

    let externalSlots = budget;
    let inAppSlots = budget;
    let count = 0;
    const dispatch: string[] = [];
    const notice: NeedNotice = { type: type === 'RE_NOTIFY' ? 'repeat' : 'new', collectionId, wave: currentWave };
    for (let i = 0; i < data.length && (externalSlots > 0 || inAppSlots > 0); i += INSERT_BATCH) {
      const batch = data.slice(i, i + INSERT_BATCH);
      // A wave can have reached some people since the graph was read.
      const notified = await tx.notification.findMany({
        where: { collectionId, userId: { in: batch.map(({ userId }) => userId) } },
        select: { userId: true },
      });
      const seen = new Set(notified.map(({ userId }) => userId));
      const selection = batch.filter(({ userId }) => {
        if (seen.has(userId)) return false;
        if (externalIds.has(userId)) {
          if (externalSlots <= 0) return false;
          externalSlots--;
        } else {
          if (inAppSlots <= 0) return false;
          inAppSlots--;
        }
        return true;
      });
      if (!selection.length) continue;
      const inserted = await tx.notification.createManyAndReturn({
        data: selection.map((row) => ({ ...row, wave: currentWave })),
        skipDuplicates: true, select: { userId: true },
      });
      count += inserted.length;
      const insertedIds = new Set(inserted.map(({ userId }) => userId));
      const externalBatch = selection.filter(({ userId }) => externalIds.has(userId) && insertedIds.has(userId))
        .map(({ userId }) => userId);
      await enqueueNeedNotice(tx, notice.type, collectionId, currentWave, externalBatch);
      dispatch.push(...externalBatch);
    }
    return { count, wave: currentWave, notice, dispatch };
  });

  if (result?.dispatch.length) {
    sendNeedRequestNotices(db, result.notice, creatorId, result.dispatch).catch((err) =>
      console.error('[Notify] new collection dispatch failed:', err),
    );
  }
  return result;
}

/**
 * Collection closed by its author: one message to everyone who was notified about it.
 */
export async function sendCollectionClosedTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
): Promise<void> {
  if (recipientUserIds.length === 0) return;
  const needNotice: NeedNotice = { type: 'closed', collectionId, wave: 0 };

  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  const collection = await db.collection.findUnique({ where: { id: collectionId, status: 'CLOSED' }, select: { amount: true } });
  if (!creator || !collection) {
    await retirePendingNotices(db, pendingNoticeKey(needNotice), recipientUserIds);
    return;
  }

  const amountStr = collection.amount != null ? `${groupNumber(collection.amount)}\u00a0USD` : ''; // 1 unit = 1 $ (SO-40)
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, () => ({
    key: `col:${collectionId}:closed`,
    kind: 'collection',
    push: { title: 'Need closed', body: 'A Need you were notified about has been closed.', url: webAppLink },
    telegram: (lang) => ({
      text: `✅ <b>${tg(lang, 'closed')}</b>\n\n${tg(lang, 'from')}: <b>${tgEscape(creator.name)}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'closedBody')}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]] },
    }),
  }), needNotice);
}

/**
 * Goal reached: one message to the author only. Participants hear about it when the author closes the collection.
 * Called from several places (intention, amount change, block check): the key stops a second message.
 */
export async function sendGoalReachedToCreator(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  blockedAt: Date,
): Promise<void> {
  const collection = await db.collection.findUnique({
    where: { id: collectionId, status: 'BLOCKED', blockReason: null, blockedAt },
    select: { amount: true, chatLink: true },
  });
  if (!collection) return;

  const amountStr = collection.amount != null ? `${groupNumber(collection.amount)}\u00a0USD` : ''; // 1 unit = 1 $
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;
  const stamp = blockedAt.getTime();

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

function formatCycleRange(lang: string, start: Date, end: Date): string {
  const options = { dateStyle: 'medium', timeZone: 'UTC' } as const;
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat(lang, options);
  } catch {
    formatter = new Intl.DateTimeFormat('en', options);
  }
  return formatter.formatRange(start, end);
}

/**
 * Per-user contribution to a regular collection (active subscriptions only).
 * Always in $ (one unit of participation), obligation.amount is stored in $.
 */
async function getUserContributions(
  db: PrismaClient,
  collectionId: string,
  userIds: string[],
  preference: 'notifyRenewalReminder' | 'notifyRenewalStart',
): Promise<Map<string, string>> {
  const obligations = await db.obligation.findMany({
    where: { collectionId, userId: { in: userIds }, unsubscribedAt: null, user: { deletedAt: null, [preference]: true } },
    select: { userId: true, amount: true },
  });
  const sums = new Map<string, number>();
  for (const o of obligations) sums.set(o.userId, (sums.get(o.userId) ?? 0) + o.amount);
  const result = new Map<string, string>();
  for (const [userId, sum] of sums) result.set(userId, `${groupNumber(Math.round(sum * 100) / 100)}\u00a0$`);
  return result;
}

/** The person’s Participation amount and the cycle dates. */
function cycleDetails(lang: string, contribution: string | undefined, start: Date, end: Date): string {
  const lines: string[] = [];
  if (contribution) lines.push(`${tg(lang, 'yourContribution')}: <b>${contribution}</b>`);
  lines.push(`${tg(lang, 'period')}: ${formatCycleRange(lang, start, end)}`);
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
  cycleNumber: number,
): Promise<void> {
  if (recipientUserIds.length === 0) return;
  const needNotice: NeedNotice = { type: 'reminder', collectionId, wave: cycleNumber };

  const collection = await db.collection.findUnique({
    where: { id: collectionId, type: 'REGULAR', cycleNumber, status: { in: ['ACTIVE', 'BLOCKED'] }, blockReason: null },
    select: { currentCycleStart: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection?.currentCycleStart || !creator) {
    await retirePendingNotices(db, pendingNoticeKey(needNotice), recipientUserIds);
    return;
  }

  // The reminder is about the NEXT cycle: it starts when the current one ends.
  const cycleStart = collection.currentCycleStart;
  const periodStart = new Date(cycleStart.getTime() + REGULAR_CYCLE_DAYS * DAY_MS);
  const periodEnd = new Date(periodStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY_MS); // last day of the cycle
  const contributions = await getUserContributions(db, collectionId, recipientUserIds, 'notifyRenewalReminder');
  const activeUserIds = [...contributions.keys()];
  const names = await userNames(db, activeUserIds);
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, (userId) => contributions.has(userId) ? ({
    key: `cycle:${collectionId}:${cycleNumber}:reminder`,
    kind: 'cycle',
    push: { title: 'New cycle in 3 days', body: 'A Need you take part in (every 28 days) starts a new cycle in 3 days.', url: webAppLink },
    telegram: (lang) => ({
      text: `🔔 <b>${tg(lang, 'renewalReminderTitle')}</b>\n\n${tg(lang, 'renewalReminderBody').replace('{{name}}', tgEscape(names.get(userId))).replace('{{creator}}', tgEscape(creator.name))}${cycleDetails(lang, contributions.get(userId), periodStart, periodEnd)}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'open')}`, web_app: { url: webAppLink } }]] },
    }),
  }) : null, needNotice);
}

/**
 * "Cycle renewed" (a new cycle of regular help just started, SO-1): one external message per person and cycle.
 */
export async function sendCycleRenewedTg(
  db: PrismaClient,
  collectionId: string,
  creatorId: string,
  recipientUserIds: string[],
  cycleNumber: number,
): Promise<void> {
  if (recipientUserIds.length === 0) return;
  const needNotice: NeedNotice = { type: 'start', collectionId, wave: cycleNumber };

  const collection = await db.collection.findUnique({
    where: { id: collectionId, type: 'REGULAR', cycleNumber, status: { in: ['ACTIVE', 'BLOCKED'] }, blockReason: null },
    select: { currentCycleStart: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection?.currentCycleStart || !creator) {
    await retirePendingNotices(db, pendingNoticeKey(needNotice), recipientUserIds);
    return;
  }

  // Called right after the cycle was rolled over, so currentCycleStart is the new cycle.
  const periodStart = collection.currentCycleStart;
  const periodEnd = new Date(periodStart.getTime() + (REGULAR_CYCLE_DAYS - 1) * DAY_MS); // last day of the cycle
  const names = await userNames(db, recipientUserIds);
  // Read active Participation again at dispatch, after the worker's candidate list was made.
  const contributions = await getUserContributions(db, collectionId, recipientUserIds, 'notifyRenewalStart');
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;

  await deliverMany(db, recipientUserIds, (userId) => contributions.has(userId) ? ({
    key: `cycle:${collectionId}:${cycleNumber}:start`,
    kind: 'cycle',
    push: { title: 'New cycle started', body: 'A Need you take part in (every 28 days) has started a new cycle.', url: webAppLink },
    telegram: (lang) => ({
      text: `🔁 <b>${tg(lang, 'renewalStartTitle')}</b>\n\n${tg(lang, 'renewalStartBody').replace('{{name}}', tgEscape(names.get(userId))).replace('{{creator}}', tgEscape(creator.name))}${cycleDetails(lang, contributions.get(userId), periodStart, periodEnd)}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'view')}`, web_app: { url: webAppLink } }]] },
    }),
  }) : null, needNotice);
}

async function userNames(db: PrismaClient, ids: string[]): Promise<Map<string, string>> {
  const users = await db.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
  return new Map(users.map((u) => [u.id, u.name]));
}

/** New collection (or a later wave): one message per person, through their own channel */
export async function sendNeedRequestNotices(
  db: PrismaClient,
  notice: NeedNotice,
  creatorId: string,
  userIds: string[],
): Promise<void> {
  const { collectionId, type } = notice;
  const collection = await db.collection.findUnique({
    where: { id: collectionId, status: 'ACTIVE' },
    select: { type: true, amount: true, blockReason: true },
  });
  const creator = await db.user.findUnique({ where: { id: creatorId }, select: { name: true } });
  if (!collection || !creator || collection.blockReason === 'COMMUNITY') {
    await retirePendingNotices(db, pendingNoticeKey(notice), userIds);
    return;
  }

  const isEmergency = collection.type === 'EMERGENCY';
  const amountStr = collection.amount != null ? `${groupNumber(collection.amount)}\u00a0USD` : '';
  const webAppLink = `${WEB_APP_URL}/collection/${collectionId}`;
  const push = requestPushPayload(notice);

  const outcomes = await deliverMany(db, userIds, () => ({
    key: `col:${collectionId}:new`, // one message per person per collection, whatever the wave
    kind: 'newCollection',
    push,
    telegram: (lang) => ({
      text: `${isEmergency ? '🚨' : '📢'} <b>${isEmergency ? tg(lang, 'newEmergency') : tg(lang, 'newRegular')}</b>\n\n${tg(lang, 'from')}: <b>${tgEscape(creator.name)}</b>${amountStr ? `\n${tg(lang, 'amount')}: ${amountStr}` : ''}\n\n${tg(lang, 'networkSupport')}`,
      replyMarkup: { inline_keyboard: [[{ text: `📱 ${tg(lang, 'open')}`, web_app: { url: webAppLink } }]] },
    }),
  }), notice);
  const counts: Record<string, number> = {};
  for (const o of outcomes.values()) counts[o] = (counts[o] ?? 0) + 1;
  console.log(`[Notify] collection ${collectionId} ${type}:`, counts);
}
