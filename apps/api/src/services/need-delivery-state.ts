import { Prisma, type PrismaClient } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { canRouteRequest, recordSent } from './notify-routing.service.js';
import type { DeliveryGate, ProviderOutcome } from './provider-outcome.js';

export const NEED_NOTICE_PREFIX = 'need-notice:';
// One recipient at a time. Allow for native push SDK timeouts and internal retries.
const LEASE_MS = 10 * 60_000;
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 3;
// Prisma's DateTime columns store UTC wall time. Use the database clock for lease transitions.
const dbClock = Prisma.sql`(clock_timestamp() AT TIME ZONE 'UTC')`;
const dbLeaseExpiry = Prisma.sql`${dbClock} + ${LEASE_MS} * interval '1 millisecond'`;

export type NoticeEvent = 'closed' | 'start' | 'reminder' | 'new' | 'repeat';
export interface NeedNotice {
  type: NoticeEvent;
  collectionId: string;
  wave: number;
}
export interface NeedDelivery {
  userId: string;
  eventKey: string;
  notice: NeedNotice;
}

export function pendingNoticeKey({ type, collectionId, wave }: NeedNotice): string {
  return `${NEED_NOTICE_PREFIX}${type}:${collectionId}:${wave}`;
}

/** Store a delivery intent in the same transaction as its in-app notice. */
export async function enqueueNeedNotice(
  tx: Prisma.TransactionClient,
  type: NoticeEvent,
  collectionId: string,
  wave: number,
  userIds: string[],
): Promise<void> {
  if (userIds.length === 0) return;
  const eventKey = pendingNoticeKey({ type, collectionId, wave });
  await tx.notificationDelivery.createMany({
    data: userIds.map((userId) => ({ userId, eventKey, channel: 'APP' })),
    skipDuplicates: true,
  });
}

export async function retirePendingNotices(db: PrismaClient, eventKey: string, userIds: string[]): Promise<void> {
  await db.notificationDelivery.deleteMany({
    where: { eventKey, userId: { in: userIds }, createdAt: { lte: new Date() } },
  });
}

function isRequest(notice: NeedNotice): boolean {
  return notice.type === 'new' || notice.type === 'repeat';
}

async function eligible(db: PrismaClient, { userId, notice }: NeedDelivery): Promise<boolean> {
  const { collectionId, type, wave } = notice;
  if (isRequest(notice)) {
    if (!(await canRouteRequest(db, userId))) return false;
    const kind = type === 'new' ? 'NEW_COLLECTION' : 'RE_NOTIFY';
    const [row] = await db.$queryRaw<{ eligible: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM notifications n
        JOIN collections c ON c.id = n."collectionId"
        JOIN users u ON u.id = n."userId"
        WHERE c.id = ${collectionId} AND u.id = ${userId} AND u."deletedAt" IS NULL
          AND u."notifyNewCollections"
          AND n.type = ${kind}::"NotificationType" AND n.wave = ${wave}
          AND n.status IN ('READ', 'UNREAD') AND n."expiresAt" > ${dbClock}
          AND c.status = 'ACTIVE' AND c."blockReason" IS DISTINCT FROM 'COMMUNITY'
          AND NOT EXISTS (
            SELECT 1 FROM obligations o WHERE o."collectionId" = c.id
            AND o."userId" = u.id AND o."unsubscribedAt" IS NULL
          )
          AND (c.amount IS NULL OR c.amount > (
            SELECT COALESCE(SUM(o.amount), 0) FROM obligations o
            WHERE o."collectionId" = c.id AND o."unsubscribedAt" IS NULL
          ))
      ) AS eligible
    `;
    return row!.eligible;
  }

  const where: Prisma.CollectionWhereInput = type === 'closed'
    ? { status: 'CLOSED' }
    : {
      type: 'REGULAR', cycleNumber: wave, status: { in: ['ACTIVE', 'BLOCKED'] }, blockReason: null,
      currentCycleStart: { gt: new Date(Date.now() - REGULAR_CYCLE_DAYS * 24 * 60 * 60_000) },
      obligations: {
        some: {
          userId, unsubscribedAt: null,
          user: { deletedAt: null, [type === 'start' ? 'notifyRenewalStart' : 'notifyRenewalReminder']: true },
        },
      },
    };
  return !!(await db.collection.findFirst({ where: { id: collectionId, ...where }, select: { id: true } }));
}

type Db = PrismaClient | Prisma.TransactionClient;

/** The pending ID carries the attempt and state (active or waiting to retry). Changing it
 * fences out former owners while keeping the unique event key stable for producers.
 * Pending createdAt is the next claim time: lease expiry or retry time.
 */
async function claimAttempt(
  db: Db,
  { userId, notice }: NeedDelivery,
): Promise<{ id: string; attempts: number } | 'pending' | 'retired'> {
  const now = new Date();
  const row = await db.notificationDelivery.findUnique({
    where: { userId_eventKey: { userId, eventKey: pendingNoticeKey(notice) } },
    select: { id: true, createdAt: true },
  });
  if (!row || row.createdAt > now) return 'pending';

  const [baseId, previous = '0'] = row.id.split('~');
  const attempts = Number.parseInt(previous, 10) + 1;
  const available = { id: row.id, createdAt: { lte: now } };
  if (attempts > MAX_ATTEMPTS) {
    await db.notificationDelivery.deleteMany({ where: available });
    return 'retired';
  }

  const id = `${baseId}~${attempts}a`;
  const claimed = await db.$executeRaw`
    UPDATE notification_deliveries SET id = ${id}, "createdAt" = ${dbLeaseExpiry}
    WHERE id = ${row.id} AND "createdAt" <= ${dbClock}
  `;
  return claimed ? { id, attempts } : 'pending';
}

async function claimRequest(db: PrismaClient, delivery: NeedDelivery) {
  return db.$transaction(async (tx) => {
    // Serialize the check and lease acquisition across Needs for this recipient. The live
    // owner rechecks the person's delivery limits before sending and commits the receipt
    // and counters atomically. Waiting/queued intents take no slots in those limits.
    const { userId } = delivery;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`need-request-delivery:${userId}`}, 0))`;
    const [row] = await tx.$queryRaw<{ active: boolean }[]>`
      SELECT EXISTS (
        SELECT 1 FROM notification_deliveries
        WHERE "userId" = ${userId} AND id LIKE '%~%a' AND "createdAt" > ${dbClock}
          AND ("eventKey" LIKE ${NEED_NOTICE_PREFIX + 'new:%'} OR "eventKey" LIKE ${NEED_NOTICE_PREFIX + 'repeat:%'})
      ) AS active
    `;
    return row!.active ? 'pending' : claimAttempt(tx, delivery);
  });
}

export async function runNeedDelivery(
  db: PrismaClient,
  delivery: NeedDelivery,
  channel: 'APP' | 'TELEGRAM',
  send: (beforeHandoff: DeliveryGate) => Promise<ProviderOutcome>,
): Promise<ProviderOutcome | 'duplicate' | 'pending'> {
  const { userId, eventKey, notice } = delivery;
  const attempt = await (isRequest(notice) ? claimRequest(db, delivery) : claimAttempt(db, delivery));
  if (typeof attempt === 'string') return attempt;
  const { id, attempts } = attempt;

  // The existing receipt may predate this drainer version. Confirm it before any network call.
  const receipt = await db.notificationDelivery.findUnique({
    where: { userId_eventKey: { userId, eventKey } },
    select: { id: true },
  });
  let outcome: ProviderOutcome | 'duplicate' = 'duplicate';
  if (!receipt) {
    try {
      outcome = await send(async () => {
        const handoffAt = Date.now();
        const renewed = await db.$executeRaw`
          UPDATE notification_deliveries SET "createdAt" = ${dbLeaseExpiry}
          WHERE id = ${id} AND "createdAt" > ${dbClock}
        `;
        // This runs after rendering, queue delay and the transport's endpoint lookup.
        return renewed > 0 && await eligible(db, delivery) && Date.now() < handoffAt + LEASE_MS;
      });
    } catch (err) {
      console.error('[NeedNotice] Handoff failed:', err instanceof Error ? err.name : 'unknown error');
      outcome = 'retry';
    }
  }

  if (outcome === 'retry' && attempts < MAX_ATTEMPTS) {
    const released = await db.notificationDelivery.updateMany({
      where: { id, createdAt: { gt: new Date() } },
      data: { id: id.slice(0, -1) + 'r', createdAt: new Date(Date.now() + RETRY_DELAY_MS) },
    });
    return released.count ? 'retry' : 'pending';
  }

  const finalized = await db.$transaction(async (tx) => {
    const consumed = await tx.notificationDelivery.deleteMany({ where: { id, createdAt: { gt: new Date() } } });
    if (!consumed.count) return false;
    if (outcome === 'sent') {
      const inserted = await tx.notificationDelivery.createMany({ data: [{ userId, eventKey, channel }], skipDuplicates: true });
      if (inserted.count && isRequest(notice)) await recordSent(tx, [userId]);
    }
    return true;
  });
  if (!finalized) return 'pending';
  return outcome === 'retry' ? 'retired' : outcome;
}
