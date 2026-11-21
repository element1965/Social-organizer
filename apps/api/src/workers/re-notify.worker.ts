import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_RATIO, RE_NOTIFY_INTERVAL_HOURS } from '@so/shared';
import { lastNeedWaveAt, sendScheduledRepeatWave } from '../services/notification.service.js';
import { activeObligationTotals } from '../services/collection-amount.js';

const HOUR_MS = 60 * 60 * 1000;

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
      if ((await lastNeedWaveAt(db, collection)) > cutoff) continue;

      const { amount: pledged } = await activeObligationTotals(db, collection.id);
      const shortfall = collection.amount! - pledged;
      if (shortfall <= 0) continue;

      const maxRecipients = Math.ceil(shortfall / NOTIFICATION_RATIO);

      const wave = await sendScheduledRepeatWave(db, collection.id, collection.creatorId, maxRecipients, {
        createdAt: collection.createdAt, cutoff, now,
      });
      if (!wave) continue;
      result.set(collection.id, wave.count);
      console.log(`[re-notify] collection ${collection.id}: wave ${wave.wave}, shortfall ${shortfall}, reached ${wave.count}`);
    } catch (err) {
      console.error(`[re-notify] collection ${collection.id} failed:`, err);
    }
  }
  return result;
}

export async function processReNotify(_job: Job): Promise<void> {
  await runReNotify(getDb());
}
