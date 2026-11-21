import type { PrismaClient } from '@so/db';
import {
  sendCollectionClosedTg, sendCycleRenewalReminderTg, sendCycleRenewedTg, sendNeedRequestNotices,
} from './notification.service.js';
import { NEED_NOTICE_PREFIX, retirePendingNotices, type NoticeEvent } from './need-delivery-state.js';

/** Page through due intents. Each sender claims its own recipient just before attempting delivery. */
export async function dispatchPendingNeedNotices(
  db: PrismaClient,
  events: NoticeEvent[],
  collectionId?: string,
): Promise<void> {
  let afterId: string | undefined;
  for (;;) {
    const rows = await db.notificationDelivery.findMany({
      where: {
        OR: events.map((type) => ({
          eventKey: { startsWith: `${NEED_NOTICE_PREFIX}${type}:${collectionId == null ? '' : `${collectionId}:`}` },
        })),
        createdAt: { lte: new Date() },
        id: { gt: afterId },
      },
      select: { id: true, userId: true, eventKey: true },
      orderBy: { id: 'asc' },
      take: 250,
    });
    if (rows.length === 0) return;
    afterId = rows.at(-1)!.id;

    const groups = new Map<string, string[]>();
    for (const { eventKey, userId } of rows) {
      const users = groups.get(eventKey) ?? [];
      users.push(userId);
      groups.set(eventKey, users);
    }

    for (const [key, userIds] of groups) {
      const [, type, id, waveText] = key.split(':') as [string, NoticeEvent, string, string];
      const notice = { type, collectionId: id, wave: Number(waveText) };
      try {
        const need = await db.collection.findUnique({ where: { id }, select: { creatorId: true } });
        if (!need) {
          await retirePendingNotices(db, key, userIds);
        } else if (type === 'closed') {
          await sendCollectionClosedTg(db, id, need.creatorId, userIds);
        } else if (type === 'new' || type === 'repeat') {
          await sendNeedRequestNotices(db, notice, need.creatorId, userIds);
        } else {
          const send = type === 'start' ? sendCycleRenewedTg : sendCycleRenewalReminderTg;
          await send(db, id, need.creatorId, userIds, notice.wave);
        }
      } catch (err) {
        console.error('[NeedNotice] Drain failed:', err instanceof Error ? err.name : 'unknown error');
      }
    }
  }
}
