import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_RATIO, RE_NOTIFY_INTERVAL_HOURS } from '@so/shared';
import { sendCollectionNotifications } from '../services/notification.service.js';
import { activeObligationTotals } from '../services/collection-amount.js';

const HOUR_MS = 60 * 60 * 1000;

/** Key of the "this collection was checked, nobody new was found" marker (see markChecked). */
const CHECK_KEY_PREFIX = 'renotify:';

/**
 * Records a finished check that reached nobody, so the collection is not scanned again for another
 * interval. It is a bookkeeping row in notification_deliveries (unique per user + key, pruned after
 * 60 days), owned by the author; it sends nothing and never shows in any feed.
 */
async function markChecked(db: PrismaClient, collectionId: string, creatorId: string, now: Date): Promise<void> {
  await db.notificationDelivery.create({
    data: { userId: creatorId, eventKey: `${CHECK_KEY_PREFIX}${collectionId}:${now.getTime()}`, channel: 'APP' },
  });
}

/** Time of the last wave: newest request entry, newest empty check, or the creation of the collection. */
async function lastWaveAt(db: PrismaClient, collection: { id: string; creatorId: string; createdAt: Date }): Promise<Date> {
  const [entry, check] = await Promise.all([
    db.notification.findFirst({
      where: { collectionId: collection.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    db.notificationDelivery.findFirst({
      where: { userId: collection.creatorId, eventKey: { startsWith: `${CHECK_KEY_PREFIX}${collection.id}:` } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);
  return new Date(Math.max(collection.createdAt.getTime(), entry?.createdAt.getTime() ?? 0, check?.createdAt.getTime() ?? 0));
}

/**
 * Repeat notification waves of emergency collections (MVP spec, "repeat notification").
 * While an emergency collection is active (not blocked, paused or closed) and still short of its amount,
 * a new wave goes out once the previous one is RE_NOTIFY_INTERVAL_HOURS old. Only people who never got
 * an entry about the collection are reached (sendCollectionNotifications skips the rest and walks on
 * along the graph). Regular collections are announced once at creation and never come here.
 *
 * Runs hourly; the per-collection gate (not the schedule) enforces the interval, so a restart
 * neither skips nor doubles a wave. Returns the number of entries created per collection.
 */
export async function runReNotify(db: PrismaClient, now: Date = new Date()): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  const cutoff = new Date(now.getTime() - RE_NOTIFY_INTERVAL_HOURS * HOUR_MS);

  const candidates = await db.collection.findMany({
    where: {
      type: 'EMERGENCY',
      status: 'ACTIVE',
      blockReason: null,
      amount: { not: null },
      createdAt: { lte: cutoff },
      creator: { deletedAt: null },
    },
    select: { id: true, creatorId: true, amount: true, createdAt: true },
  });

  for (const collection of candidates) {
    try {
      if ((await lastWaveAt(db, collection)) > cutoff) continue;

      const { amount: pledged } = await activeObligationTotals(db, collection.id);
      const shortfall = collection.amount! - pledged;
      if (shortfall <= 0) continue;

      const maxRecipients = Math.ceil(shortfall / NOTIFICATION_RATIO);

      // Next wave number: after the highest RE_NOTIFY wave so far (updateAmount sends wave 1)
      const last = await db.notification.aggregate({
        where: { collectionId: collection.id, type: 'RE_NOTIFY' },
        _max: { wave: true },
      });
      const wave = (last._max.wave ?? 0) + 1;

      const created = await sendCollectionNotifications(db, collection.id, collection.creatorId, 'RE_NOTIFY', wave, maxRecipients);
      if (created === 0) await markChecked(db, collection.id, collection.creatorId, now);
      result.set(collection.id, created);
      console.log(`[re-notify] collection ${collection.id}: wave ${wave}, shortfall ${shortfall}, reached ${created}`);
    } catch (err) {
      console.error(`[re-notify] collection ${collection.id} failed:`, err);
    }
  }
  return result;
}

export async function processReNotify(_job: Job): Promise<void> {
  await runReNotify(getDb());
}
