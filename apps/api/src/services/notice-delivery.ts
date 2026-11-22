import type { PrismaClient } from '@so/db';
import {
  sendCollectionClosedTg, sendCycleRenewalReminderTg, sendCycleRenewedTg, sendNeedRequestNotices,
} from './notification.service.js';
import { listDueNeedNoticePage, retirePendingNotices, type NoticeEvent } from './need-delivery-state.js';

/** Page through due intents. Each sender claims its own recipient just before attempting delivery. */
export async function dispatchPendingNeedNotices(
  db: PrismaClient,
  events: NoticeEvent[],
  collectionId?: string,
): Promise<void> {
  let afterId: string | undefined;
  for (;;) {
    const rows = await listDueNeedNoticePage(db, events, collectionId, afterId);
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

const DIRECT_DRAIN_INTERVAL_MS = 60_000;

/** Drain durable intents at startup and periodically when BullMQ is disabled. */
export function startDirectNeedNoticeDrain(db: PrismaClient): () => Promise<void> {
  let running: Promise<void> | undefined;
  const tick = () => {
    if (running) return;
    running = dispatchPendingNeedNotices(db, ['closed', 'start', 'reminder', 'new', 'repeat'])
      .catch((err) => console.error('[NeedNotice] Direct drain failed:', err instanceof Error ? err.name : 'unknown error'))
      .finally(() => { running = undefined; });
  };
  const timer = setInterval(tick, DIRECT_DRAIN_INTERVAL_MS);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await running;
  };
}
