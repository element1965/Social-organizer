import { Prisma, type PrismaClient } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { FREQ_DAY, FREQ_WEEK, IGNORE_LIMIT, PROBE_AFTER_DAYS, recordSent } from './notify-routing.service.js';
import type { DeliveryGate, ProviderOutcome, PushDestination } from './provider-outcome.js';

export const NEED_NOTICE_PREFIX = 'need-notice:';
// One recipient at a time. Allow for native push SDK timeouts and internal retries.
const LEASE_MS = 10 * 60_000;
const HANDOFF_SAFETY_MS = 1_000;
const RETRY_DELAY_MS = 60_000;
const MAX_ATTEMPTS = 3;
// Prisma's DateTime columns store UTC wall time. Use the database clock for lease transitions.
const dbClock = Prisma.sql`(clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3)`;
const dbStatementTime = Prisma.sql`(statement_timestamp() AT TIME ZONE 'UTC')::timestamp(3)`;
const dbLeaseExpiry = Prisma.sql`${dbClock} + ${LEASE_MS} * interval '1 millisecond'`;
const dbRetryAt = Prisma.sql`${dbClock} + ${RETRY_DELAY_MS} * interval '1 millisecond'`;

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

export function listDueNeedNoticePage(
  db: PrismaClient, events: NoticeEvent[], collectionId?: string, afterId?: string,
): Promise<{ id: string; userId: string; eventKey: string }[]> {
  const prefixes = events.map((type) => `${NEED_NOTICE_PREFIX}${type}:${collectionId == null ? '' : `${collectionId}:`}%`);
  const cursor = afterId == null ? Prisma.empty : Prisma.sql`AND id > ${afterId}`;
  return db.$queryRaw`
    SELECT id, "userId", "eventKey" FROM notification_deliveries
    WHERE "eventKey" LIKE ANY(${prefixes}::text[]) AND "createdAt" <= ${dbStatementTime} ${cursor}
    ORDER BY id LIMIT 250
  `;
}

export async function retirePendingNotices(db: PrismaClient, eventKey: string, userIds: string[]): Promise<void> {
  await db.$executeRaw`
    DELETE FROM notification_deliveries WHERE "eventKey" = ${eventKey} AND "userId" = ANY(${userIds}::text[])
      AND "createdAt" <= ${dbClock}
  `;
}

export function isRequest(notice: NeedNotice): boolean {
  return notice.type === 'new' || notice.type === 'repeat';
}

async function eligibleNonRequest(db: PrismaClient, { userId, notice }: NeedDelivery): Promise<boolean> {
  const { collectionId, type, wave } = notice;

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
async function claimAttempt(db: Db, { userId, notice }: NeedDelivery): Promise<Attempt | 'pending' | 'retired'> {
  const idle = isRequest(notice)
    ? Prisma.sql`AND NOT EXISTS (
        SELECT 1 FROM notification_deliveries live
        WHERE live."userId" = ${userId} AND live.id LIKE '%~%a' AND live."createdAt" > ${dbClock}
          AND (live."eventKey" LIKE ${NEED_NOTICE_PREFIX + 'new:%'} OR live."eventKey" LIKE ${NEED_NOTICE_PREFIX + 'repeat:%'})
      )`
    : Prisma.empty;
  const [claimed] = await db.$queryRaw<Attempt[]>`
    WITH due AS (
      SELECT id, COALESCE(NULLIF(regexp_replace(split_part(id, '~', 2), '[ar]$', ''), '')::int, 0) + 1 AS attempts
      FROM notification_deliveries
      WHERE "userId" = ${userId} AND "eventKey" = ${pendingNoticeKey(notice)} AND "createdAt" <= ${dbClock}
      ${idle}
    )
    UPDATE notification_deliveries d
    SET id = split_part(d.id, '~', 1) || '~' || due.attempts || 'a', "createdAt" = ${dbLeaseExpiry}
    FROM due WHERE d.id = due.id AND d."createdAt" <= ${dbClock}
    RETURNING d.id, due.attempts
  `;
  if (!claimed) return 'pending';
  if (claimed.attempts > MAX_ATTEMPTS) {
    await db.notificationDelivery.deleteMany({ where: { id: claimed.id } });
    return 'retired';
  }
  return claimed;
}

async function claimRequest(db: PrismaClient, delivery: NeedDelivery) {
  return db.$transaction(async (tx) => {
    // Serialize claims across Needs for this recipient. Queued intents take no frequency slots.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`need-request-delivery:${delivery.userId}`}, 0))`;
    return claimAttempt(tx, delivery);
  });
}

type Channel = 'APP' | 'TELEGRAM';
type Attempt = { id: string; attempts: number };
type DeliveryResult = ProviderOutcome | 'duplicate' | 'pending';

async function prepareDelivery(db: PrismaClient, delivery: NeedDelivery): Promise<Attempt | DeliveryResult> {
  const attempt = await (isRequest(delivery.notice) ? claimRequest(db, delivery) : claimAttempt(db, delivery));
  if (typeof attempt === 'string') return attempt;
  const { userId, eventKey } = delivery;
  // Receipts may predate the durable intents.
  const receipt = await db.notificationDelivery.findUnique({
    where: { userId_eventKey: { userId, eventKey } },
    select: { id: true },
  });
  return receipt ? finishDelivery(db, delivery, attempt, 'duplicate', 'APP') : attempt;
}

async function finishDelivery(
  db: PrismaClient, delivery: NeedDelivery, { id, attempts }: Attempt,
  outcome: ProviderOutcome | 'duplicate', channel: Channel,
): Promise<DeliveryResult> {
  if (outcome === 'retry' && attempts < MAX_ATTEMPTS) {
    const released = await db.$executeRaw`
      UPDATE notification_deliveries SET id = ${id.slice(0, -1) + 'r'}, "createdAt" = ${dbRetryAt}
      WHERE id = ${id} AND "createdAt" > ${dbClock}
    `;
    return released ? 'retry' : 'pending';
  }

  const { userId, eventKey, notice } = delivery;
  const finalized = await transactionWithRetry(db, async (tx) => {
    const consumed = await tx.$executeRaw`
      DELETE FROM notification_deliveries WHERE id = ${id} AND "createdAt" > ${dbClock}
    `;
    if (!consumed) return false;
    if (outcome === 'sent') {
      const inserted = await tx.notificationDelivery.createMany({ data: [{ userId, eventKey, channel }], skipDuplicates: true });
      if (inserted.count && isRequest(notice)) {
        await recordSent(tx, userId, notice.collectionId, notice.type === 'new' ? 'NEW_COLLECTION' : 'RE_NOTIFY', notice.wave);
      }
    }
    return true;
  });
  if (!finalized) return 'pending';
  return outcome === 'retry' ? 'retired' : outcome;
}

export async function runNeedDelivery(
  db: PrismaClient,
  delivery: NeedDelivery,
  channel: Channel,
  send: (beforeHandoff: DeliveryGate) => Promise<ProviderOutcome>,
): Promise<DeliveryResult> {
  const attempt = await prepareDelivery(db, delivery);
  if (typeof attempt === 'string') return attempt;
  let outcome: ProviderOutcome;
  try {
    outcome = await send(async () => {
      const handoffAt = Date.now();
      const renewed = await db.$executeRaw`
        UPDATE notification_deliveries SET "createdAt" = ${dbLeaseExpiry}
        WHERE id = ${attempt.id} AND "createdAt" > ${dbClock}
      `;
      return renewed > 0 && await eligibleNonRequest(db, delivery) && Date.now() < handoffAt + LEASE_MS;
    });
  } catch (err) {
    console.error('[NeedNotice] Handoff failed:', err instanceof Error ? err.name : 'unknown error');
    outcome = 'retry';
  }
  return finishDelivery(db, delivery, attempt, outcome, channel);
}

export type RequestTarget =
  | { channel: 'APP'; destinationOwned: boolean }
  | { channel: 'TELEGRAM'; telegramId: string };

type RequestAuthorization = {
  attempt: Attempt;
  delivery: NeedDelivery;
  destination?: PushDestination;
};
type RequestSend = {
  delivery: NeedDelivery;
  send: (
    target: RequestTarget,
    refresh: (destination?: PushDestination) => Promise<RequestTarget | undefined>,
  ) => Promise<{ channel: Channel; outcome: ProviderOutcome }>;
};

/** Renew each specific owner's lease and resolve each target from the same database snapshot. */
async function authorizeRequests(
  db: PrismaClient,
  requests: RequestAuthorization[],
): Promise<Map<string, RequestTarget>> {
  if (requests.length === 0) return new Map();
  const inputs = requests.map(({ attempt, delivery: { userId, notice }, destination }) => ({
    id: attempt.id, userId, collectionId: notice.collectionId, wave: notice.wave,
    pushKind: destination?.kind, pushId: destination?.id,
    pushPlatform: destination?.kind === 'native' ? destination.platform : null,
    kind: notice.type === 'new' ? 'NEW_COLLECTION' : 'RE_NOTIFY',
  }));
  const rows = await db.$queryRaw<Array<{ id: string; channel: Channel; telegramId: string | null; destinationOwned: boolean }>>`
    WITH requests AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(inputs)}::jsonb)
        AS r(
          id text, "userId" text, "collectionId" text, kind text, wave int,
          "pushKind" text, "pushId" text, "pushPlatform" text
        )
    ), owned AS (
      UPDATE notification_deliveries d SET "createdAt" = ${dbLeaseExpiry}
      FROM requests r WHERE d.id = r.id AND d."createdAt" > ${dbClock}
      RETURNING r.*
    ), pledges AS (
      SELECT o."collectionId", SUM(o.amount) AS total
      FROM obligations o
      JOIN (SELECT DISTINCT "collectionId" FROM owned) needs USING ("collectionId")
      WHERE o."unsubscribedAt" IS NULL GROUP BY o."collectionId"
    ), frequency AS (
      SELECT d."userId",
        COUNT(*) FILTER (WHERE d."createdAt" >= ${dbClock} - interval '1 day') AS day, COUNT(*) AS week
      FROM notification_deliveries d
      JOIN (SELECT DISTINCT "userId" FROM owned) recipients USING ("userId")
      WHERE d."eventKey" LIKE 'col:%:new' AND d."createdAt" >= ${dbClock} - interval '7 days'
      GROUP BY d."userId"
    ), eligible AS (
      SELECT r.id, u."notifyChannel", telegram."platformId" AS "telegramId",
        EXISTS (SELECT 1 FROM push_subscriptions WHERE "userId" = u.id)
        OR EXISTS (SELECT 1 FROM native_push_tokens WHERE "userId" = u.id) AS "hasPush",
        CASE r."pushKind"
          WHEN 'web' THEN EXISTS (SELECT 1 FROM push_subscriptions WHERE id = r."pushId" AND "userId" = u.id)
          WHEN 'native' THEN EXISTS (
            SELECT 1 FROM native_push_tokens WHERE id = r."pushId" AND "userId" = u.id AND platform = r."pushPlatform"
          )
          ELSE true
        END AS "destinationOwned"
      FROM owned r
      JOIN users u ON u.id = r."userId"
      JOIN collections c ON c.id = r."collectionId"
      JOIN users creator ON creator.id = c."creatorId"
      JOIN notifications n ON n."collectionId" = c.id AND n."userId" = u.id
        AND n.type = r.kind::"NotificationType" AND n.wave = r.wave
      LEFT JOIN pledges p ON p."collectionId" = c.id
      LEFT JOIN frequency f ON f."userId" = u.id
      LEFT JOIN notify_stats s ON s."userId" = u.id
      LEFT JOIN LATERAL (
        SELECT a."platformId" FROM platform_accounts a WHERE a."userId" = u.id AND a.platform = 'TELEGRAM'
        ORDER BY a."createdAt", a.id LIMIT 1
      ) telegram ON true
      WHERE u."deletedAt" IS NULL AND u."notifyNewCollections" AND creator."deletedAt" IS NULL
        AND NOT (COALESCE(u."monthlyBudget", 0) > 0 AND COALESCE(u."remainingBudget", 0) <= 0)
        AND COALESCE(f.day, 0) < ${FREQ_DAY} AND COALESCE(f.week, 0) < ${FREQ_WEEK}
        AND (COALESCE(s."ignoreStreak", 0) < ${IGNORE_LIMIT} OR s."lastSentAt" IS NULL
          OR s."lastSentAt" <= ${dbClock} - ${PROBE_AFTER_DAYS} * interval '1 day')
        AND n.status IN ('READ', 'UNREAD') AND n."expiresAt" > ${dbClock}
        AND c.status = 'ACTIVE' AND c."blockReason" IS DISTINCT FROM 'COMMUNITY'
        AND c.amount > COALESCE(p.total, 0)
        AND NOT EXISTS (
          SELECT 1 FROM obligations o WHERE o."collectionId" = c.id
            AND o."userId" = u.id AND o."unsubscribedAt" IS NULL
        )
        AND NOT EXISTS (
          SELECT 1 FROM ignore_entries i
          WHERE (i."fromUserId" = c."creatorId" AND i."toUserId" = u.id)
             OR (i."fromUserId" = u.id AND i."toUserId" = c."creatorId")
        )
    ), routed AS (
      SELECT *, CASE
        WHEN "notifyChannel" = 'APP' THEN 'APP'
        WHEN "telegramId" IS NOT NULL AND ("notifyChannel" = 'TELEGRAM' OR NOT "hasPush") THEN 'TELEGRAM'
        ELSE 'APP'
      END AS channel FROM eligible
    )
    SELECT id, channel, "telegramId", "destinationOwned" FROM routed
    WHERE (channel = 'APP' AND "hasPush") OR channel = 'TELEGRAM'
  `;
  return new Map(rows.map(({ id, channel, telegramId, destinationOwned }) => [
    id, channel === 'APP' ? { channel, destinationOwned } : { channel, telegramId: telegramId! },
  ]));
}

/** A batch shares the final eligibility read, while claims and acknowledgements still belong to each intent. */
export async function runNeedRequestBatch(
  db: PrismaClient, requests: RequestSend[],
): Promise<PromiseSettledResult<DeliveryResult>[]> {
  const prepared = await Promise.allSettled(requests.map(({ delivery }) => prepareDelivery(db, delivery)));
  const owned = prepared.flatMap((p, i) => p.status === 'fulfilled' && typeof p.value !== 'string'
    ? [{ attempt: p.value, delivery: requests[i]!.delivery }] : []);
  // The database can renew the lease before the result reaches this process.
  const deadline = performance.now() + LEASE_MS - HANDOFF_SAFETY_MS;
  const targets = await authorizeRequests(db, owned).catch((err) => {
    console.error('[NeedNotice] Request authorization failed:', err instanceof Error ? err.name : 'unknown error');
    return null;
  });
  return Promise.allSettled(prepared.map(async (p, i) => {
    if (p.status === 'rejected') throw p.reason;
    const attempt = p.value;
    if (typeof attempt === 'string') return attempt;
    const { delivery, send } = requests[i]!;
    const target = targets?.get(attempt.id);
    let result: { channel: Channel; outcome: ProviderOutcome } = { channel: 'APP', outcome: targets ? 'retired' : 'retry' };
    if (target) {
      try {
        if (performance.now() >= deadline) {
          result.outcome = 'retry';
        } else {
          result = await send(target, async (destination) => {
            const refreshDeadline = performance.now() + LEASE_MS - HANDOFF_SAFETY_MS;
            const refreshed = await authorizeRequests(db, [{ attempt, delivery, destination }]);
            if (performance.now() >= refreshDeadline) throw new Error('Request handoff authorization timed out');
            return refreshed.get(attempt.id);
          });
        }
      } catch (err) {
        console.error('[NeedNotice] Handoff failed:', err instanceof Error ? err.name : 'unknown error');
        result.outcome = 'retry';
      }
    }
    return finishDelivery(db, delivery, attempt, result.outcome, result.channel);
  }));
}
