import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS, NOTIFICATION_TTL_HOURS } from '@so/shared';
import { sendCycleRenewalReminderTg } from '../services/notification.service.js';
import { insertCycleNotices } from '../services/cycle-notices.js';
import { findNeedForUpdate } from '../services/collection-state.js';

const DAYS_BEFORE_RENEWAL = 3;

/**
 * Every hour: find regular collections whose 28-day cycle ends in ~3 days,
 * and remind active subscribers so they can either prepare to pay or unsubscribe.
 *
 * Deduplication: the unique (userId, collectionId, type, wave=cycleNumber) constraint
 * guarantees a single reminder per user per cycle even if the worker runs many times.
 */
export async function processCycleRenewalReminder(_job: Job): Promise<void> {
  const db = getDb();
  const now = Date.now();
  const cycleMs = REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000;
  const dayMs = 24 * 60 * 60 * 1000;
  // Pick cycles with 2 to 3 days remaining. The one-day window gives the hourly worker slack.
  const windowEnd = new Date(now - cycleMs + DAYS_BEFORE_RENEWAL * dayMs);
  const windowStart = new Date(windowEnd.getTime() - dayMs);

  const dueCollections = await db.collection.findMany({
    where: {
      type: 'REGULAR',
      status: { in: ['ACTIVE', 'BLOCKED'] },
      blockReason: null, // no renewal reminders for a suspended Need
      currentCycleStart: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      creatorId: true,
      cycleNumber: true,
      currentCycleStart: true,
    },
  });

  if (dueCollections.length === 0) return;

  const expiresAt = new Date(now + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const collection of dueCollections) {
    const createdUserIds = await db.$transaction(async (tx) => {
      // Take the same lock as withdrawals before the insert takes its statement snapshot.
      if (!await findNeedForUpdate(tx, collection.id)) return [];
      return insertCycleNotices(
        tx, collection.id, collection.cycleNumber, collection.currentCycleStart, expiresAt, 'CYCLE_RENEWAL_REMINDER',
      );
    });

    if (createdUserIds.length > 0) {
      sendCycleRenewalReminderTg(db, collection.id, collection.creatorId, createdUserIds, collection.cycleNumber)
        .catch((err) => console.error('[CycleRenewalReminder] TG/Push dispatch failed:', err));
    }
  }
}
