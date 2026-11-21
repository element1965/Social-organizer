import type { Prisma, PrismaClient } from '@so/db';
import { sendCollectionClosedTg, sendCycleRenewalReminderTg, sendCycleRenewedTg } from './notification.service.js';

type NoticeEvent = 'closed' | 'start' | 'reminder';
const prefix = 'need-notice:';
const batchSize = 250;
const leaseMs = 10 * 60 * 1000;

/** Store a delivery intent in the same transaction as its in-app notice. */
export async function enqueueNeedNotice(
  tx: Prisma.TransactionClient,
  event: NoticeEvent,
  collectionId: string,
  cycleNumber: number,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const eventKey = `${prefix}${event}:${collectionId}:${cycleNumber}`;
  // Pending rows use their own key namespace. The actual channel is resolved at dispatch.
  await tx.notificationDelivery.createMany({
    data: userIds.map((userId) => ({ userId, eventKey, channel: 'APP' })),
    skipDuplicates: true,
  });
}

/** Drain committed notice intents, including events whose Need is no longer due for processing. */
export async function dispatchPendingNeedNotices(
  db: PrismaClient,
  events: NoticeEvent[],
  collectionId?: string,
): Promise<void> {
  let afterId: string | undefined;
  for (;;) {
    const now = new Date();
    const candidates = await db.notificationDelivery.findMany({
      where: {
        OR: events.map((event) => ({
          eventKey: { startsWith: `${prefix}${event}:${collectionId == null ? '' : `${collectionId}:`}` },
        })),
        createdAt: { lte: now },
        id: { gt: afterId },
      },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batchSize,
    });
    if (candidates.length === 0) return;
    afterId = candidates.at(-1)!.id;

    // For pending rows only, createdAt doubles as the time the row may next be claimed.
    // A stopped worker leaves an expiring lease. A competing worker can only claim unleased rows.
    const leasedUntil = new Date(now.getTime() + leaseMs);
    const leased = await db.notificationDelivery.updateManyAndReturn({
      where: { id: { in: candidates.map(({ id }) => id) }, createdAt: { lte: now } },
      data: { createdAt: leasedUntil },
      select: { id: true, userId: true, eventKey: true },
    });
    const groups = new Map<string, typeof leased>();
    for (const row of leased) {
      const group = groups.get(row.eventKey) ?? [];
      group.push(row);
      groups.set(row.eventKey, group);
    }

    for (const [key, rows] of groups) {
      const [, event, needId, cycle] = key.split(':') as [string, NoticeEvent, string, string];
      const owned = { id: { in: rows.map(({ id }) => id) }, createdAt: leasedUntil };
      try {
        const need = await db.collection.findUnique({ where: { id: needId }, select: { creatorId: true } });
        if (need) {
          const userIds = rows.map(({ userId }) => userId);
          if (event === 'closed') {
            await sendCollectionClosedTg(db, needId, need.creatorId, userIds, true);
          } else {
            const send = event === 'start' ? sendCycleRenewedTg : sendCycleRenewalReminderTg;
            await send(db, needId, need.creatorId, userIds, Number(cycle), true);
          }
        }
        await db.notificationDelivery.deleteMany({ where: owned });
      } catch (err) {
        await db.notificationDelivery.updateMany({ where: owned, data: { createdAt: now } });
        console.error('[NeedNotice] Dispatch failed and will be retried:', err);
      }
    }
  }
}
