import type { PrismaClient } from '@so/db';
import { sendTgMessages, type TgReplyMarkup } from './telegram-bot.service.js';
import { sendPushNotification, type WebPushPayload } from './push.service.js';

/**
 * One external notification per event (SO-45).
 *
 * Every event a person should hear about goes through `deliver`:
 * - the person's channel is resolved once: app push OR Telegram, never both;
 * - a NotificationDelivery row with a unique (userId, eventKey) is claimed first, so a repeat,
 *   a worker retry or two parallel calls send nothing a second time;
 * - "new collection" messages respect the person's switch; requests, responses and
 *   collection updates always go through.
 * The in-app journal (Notification rows, pending requests) is separate and not affected.
 */

export type Channel = 'APP' | 'TELEGRAM';

/**
 * Kinds of events. `newCollection` can be switched off by the person; the rest are their own events.
 * `cycle` = regular help reminders (SO-1), controlled by their own switches before reaching here.
 */
export type EventKind = 'request' | 'requestAnswer' | 'response' | 'newCollection' | 'collection' | 'cycle' | 'network';

export interface OutgoingEvent {
  /** Unique per person and event, e.g. `req:<pendingId>`; a second delivery with the same key is skipped */
  key: string;
  kind: EventKind;
  /** Short push: a reason to open the app, without contacts, amounts or details of the problem */
  push: WebPushPayload;
  /** Telegram text in the person's language (null = nothing to send there) */
  telegram: (lang: string) => { text: string; replyMarkup?: TgReplyMarkup } | null;
}

export type DeliveryOutcome = 'sent' | 'duplicate' | 'muted' | 'noRecipient';

interface Target {
  userId: string;
  channel: Channel;
  telegramId: string | null;
  lang: string;
  newCollections: boolean;
  hasPush: boolean;
}

/**
 * Who would actually get a "new collection" message outside the app right now: not muted, and the
 * picked channel really reaches them (Telegram linked, or a push subscription for the app channel).
 * Everyone else would only get the in-app entry, so they must not take a slot of a notification wave.
 */
export async function reachableForNewCollections(db: PrismaClient, userIds: string[]): Promise<Set<string>> {
  const targets = await loadTargets(db, userIds);
  const out = new Set<string>();
  for (const t of targets.values()) {
    if (!t.newCollections) continue;
    if (t.channel === 'TELEGRAM' ? !!t.telegramId : t.hasPush) out.add(t.userId);
  }
  return out;
}

/**
 * The person's single channel.
 * - Explicit choice wins. Telegram chosen but no longer linked → app (the only channel left).
 * - No choice yet: app if the person has a browser/device push subscription, otherwise Telegram if linked,
 *   otherwise app (the event stays in the in-app journal).
 */
export function pickChannel(u: {
  notifyChannel: Channel | null;
  hasPush: boolean;
  telegramId: string | null;
}): Channel {
  if (u.notifyChannel === 'TELEGRAM') return u.telegramId ? 'TELEGRAM' : 'APP';
  if (u.notifyChannel === 'APP') return 'APP';
  if (u.hasPush) return 'APP';
  return u.telegramId ? 'TELEGRAM' : 'APP';
}

async function loadTargets(db: PrismaClient, userIds: string[]): Promise<Map<string, Target>> {
  const users = await db.user.findMany({
    where: { id: { in: [...new Set(userIds)] }, deletedAt: null },
    select: {
      id: true,
      language: true,
      notifyChannel: true,
      notifyNewCollections: true,
      platformAccounts: { where: { platform: 'TELEGRAM' }, select: { platformId: true }, take: 1 },
      _count: { select: { pushSubscriptions: true, nativePushTokens: true } },
    },
  });
  const map = new Map<string, Target>();
  for (const u of users) {
    const telegramId = u.platformAccounts[0]?.platformId ?? null;
    const hasPush = u._count.pushSubscriptions + u._count.nativePushTokens > 0;
    map.set(u.id, {
      userId: u.id,
      telegramId,
      lang: u.language || 'en',
      newCollections: u.notifyNewCollections,
      hasPush,
      channel: pickChannel({ notifyChannel: u.notifyChannel as Channel | null, hasPush, telegramId }),
    });
  }
  return map;
}

/** Claims the event for the person; false if it was already delivered (unique key). */
async function claim(db: PrismaClient, userId: string, eventKey: string, channel: Channel): Promise<boolean> {
  try {
    await db.notificationDelivery.create({ data: { userId, eventKey, channel } });
    return true;
  } catch (err: any) {
    if (err?.code === 'P2002') return false;
    throw err;
  }
}

/**
 * Delivers one event per person, each through their own channel. `eventFor` builds the event for a person
 * (personal text or key); returning null skips that person.
 */
export async function deliverMany(
  db: PrismaClient,
  userIds: string[],
  eventFor: (userId: string) => OutgoingEvent | null,
): Promise<Map<string, DeliveryOutcome>> {
  const outcomes = new Map<string, DeliveryOutcome>();
  if (userIds.length === 0) return outcomes;
  const targets = await loadTargets(db, userIds);

  const pushByPayload = new Map<string, { payload: WebPushPayload; userIds: string[] }>();
  const tgMessages: Array<{ telegramId: string; text: string; replyMarkup?: TgReplyMarkup }> = [];

  for (const userId of new Set(userIds)) {
    const target = targets.get(userId);
    const event = target ? eventFor(userId) : null;
    if (!target || !event) { outcomes.set(userId, 'noRecipient'); continue; }
    if (event.kind === 'newCollection' && !target.newCollections) { outcomes.set(userId, 'muted'); continue; }

    let channel = target.channel;
    let tgMessage = channel === 'TELEGRAM' ? event.telegram(target.lang) : null;
    if (channel === 'TELEGRAM' && !tgMessage) channel = 'APP'; // nothing for Telegram → the same event in the app

    if (!(await claim(db, userId, event.key, channel))) { outcomes.set(userId, 'duplicate'); continue; }
    outcomes.set(userId, 'sent');

    if (channel === 'TELEGRAM' && tgMessage && target.telegramId) {
      tgMessages.push({ telegramId: target.telegramId, ...tgMessage });
    } else {
      const k = JSON.stringify(event.push);
      const group = pushByPayload.get(k) ?? { payload: event.push, userIds: [] };
      group.userIds.push(userId);
      pushByPayload.set(k, group);
    }
  }

  for (const { payload, userIds: ids } of pushByPayload.values()) {
    await sendPushNotification(db, ids, payload).catch((err) => console.error('[Delivery] push failed:', err));
  }
  if (tgMessages.length > 0) {
    await sendTgMessages(tgMessages).catch((err) => console.error('[Delivery] telegram failed:', err));
  }
  return outcomes;
}

/** Delivers one event to one person. */
export async function deliver(db: PrismaClient, userId: string, event: OutgoingEvent): Promise<DeliveryOutcome> {
  const res = await deliverMany(db, [userId], () => event);
  return res.get(userId) ?? 'noRecipient';
}

/** Drops delivery records older than 60 days (keys are only needed to stop repeats). */
export async function pruneDeliveries(db: PrismaClient): Promise<number> {
  const res = await db.notificationDelivery.deleteMany({
    where: { createdAt: { lt: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) } },
  });
  return res.count;
}
