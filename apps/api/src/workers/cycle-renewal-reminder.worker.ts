import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS, NOTIFICATION_TTL_HOURS } from '@so/shared';
import { sendCycleRenewalReminderTg } from '../services/notification.service.js';

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
  // Reminder window: collections whose currentCycleStart falls between
  // (now - 28d + 3d) and (now - 28d + 4d) — i.e. ~3 days remain until renewal.
  // The 1-day window gives slack in case the worker is paused/restarted.
  const windowEnd = new Date(now - cycleMs + DAYS_BEFORE_RENEWAL * dayMs);
  const windowStart = new Date(windowEnd.getTime() - dayMs);

  const dueCollections = await db.collection.findMany({
    where: {
      type: 'REGULAR',
      status: { in: ['ACTIVE', 'BLOCKED'] },
      currentCycleStart: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      creatorId: true,
      cycleNumber: true,
      obligations: {
        where: { unsubscribedAt: null },
        select: { userId: true, user: { select: { notifyRenewalReminder: true } } },
      },
    },
  });

  if (dueCollections.length === 0) return;

  const expiresAt = new Date(now + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const collection of dueCollections) {
    // Exclude creator (they don't subscribe to their own collection, but be safe)
    // and users who disabled the reminder.
    const recipients = collection.obligations
      .filter((o) => o.userId !== collection.creatorId)
      .filter((o) => o.user?.notifyRenewalReminder !== false)
      .map((o) => o.userId);

    if (recipients.length === 0) continue;

    // Create in-app notifications (unique key prevents duplicates per cycle)
    const createdUserIds: string[] = [];
    for (const userId of recipients) {
      try {
        await db.notification.create({
          data: {
            userId,
            collectionId: collection.id,
            type: 'CYCLE_RENEWAL_REMINDER',
            handshakePath: [],
            expiresAt,
            wave: collection.cycleNumber,
          },
        });
        createdUserIds.push(userId);
      } catch {
        // Duplicate (already reminded this cycle) — skip silently
      }
    }

    if (createdUserIds.length > 0) {
      sendCycleRenewalReminderTg(db, collection.id, collection.creatorId, createdUserIds).catch((err) =>
        console.error('[CycleRenewalReminder] TG/Push dispatch failed:', err),
      );
    }
  }
}
