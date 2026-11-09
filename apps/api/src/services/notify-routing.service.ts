import { Prisma, type PrismaClient } from '@so/db';
import type { BfsRecipient } from './bfs.service.js';
import { reachableForNewCollections } from './delivery.service.js';

/**
 * Behaviour-aware routing of notification waves, stage 1 (docs/notifications/behaviour-routing.md).
 *
 * The order of rings never changes: a wave reaches the 1st handshake before the 2nd. Within a ring,
 * people who can be reached and are not overloaded get the external message (Telegram or push) first;
 * the rest get only the in-app entry and do not take a slot of the "1 $ = 1 message" budget:
 * - their budget for this period is used up;
 * - they had too many requests lately (FREQ_DAY / FREQ_WEEK, all collections together);
 * - they ignored IGNORE_LIMIT requests in a row (one probe again after PROBE_AFTER_DAYS);
 * - they switched requests off or no channel reaches them outside the app.
 *
 * The counters behind it (NotifyStats) are never shown to anyone and used for nothing else.
 */

export const FREQ_DAY = 2;
export const FREQ_WEEK = 6;
export const IGNORE_LIMIT = 5;
export const PROBE_AFTER_DAYS = 14;
const HALF_LIFE_SECONDS = 60 * 24 * 60 * 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- Recording ---------- */

/** Counters decayed to now, then the change applied; one statement, so parallel events do not lose updates. */
const decay = (column: string) =>
  Prisma.raw(
    `notify_stats."${column}" * power(0.5, GREATEST(EXTRACT(EPOCH FROM (now() - notify_stats."decayedAt")), 0) / ${HALF_LIFE_SECONDS})`,
  );

/** External requests delivered: one more `sent` and one more request in the current ignore streak. */
export async function recordSent(db: PrismaClient, userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;
  await db.$executeRaw`
    INSERT INTO notify_stats ("userId", sent, "ignoreStreak", "lastSentAt", "decayedAt")
    SELECT id, 1, 1, now(), now() FROM unnest(${userIds}::text[]) AS id
    ON CONFLICT ("userId") DO UPDATE SET
      sent = ${decay('sent')} + 1,
      opened = ${decay('opened')},
      responded = ${decay('responded')},
      dismissed = ${decay('dismissed')},
      "ignoreStreak" = notify_stats."ignoreStreak" + 1,
      "lastSentAt" = now(),
      "decayedAt" = now()
  `;
}

/** Any reaction ends the ignore streak. */
async function bump(db: PrismaClient, userId: string, column: 'opened' | 'responded' | 'dismissed', minutes: number | null) {
  const col = Prisma.raw(`"${column}"`);
  const respondedAt = column === 'responded' ? Prisma.sql`now()` : Prisma.sql`NULL`;
  await db.$executeRaw`
    INSERT INTO notify_stats ("userId", ${col}, "ignoreStreak", "responseMinutes", "lastRespondedAt", "decayedAt")
    VALUES (${userId}, 1, 0, ${minutes}, ${respondedAt}, now())
    ON CONFLICT ("userId") DO UPDATE SET
      sent = ${decay('sent')},
      opened = ${decay('opened')} + ${column === 'opened' ? 1 : 0},
      responded = ${decay('responded')} + ${column === 'responded' ? 1 : 0},
      dismissed = ${decay('dismissed')} + ${column === 'dismissed' ? 1 : 0},
      "ignoreStreak" = 0,
      "responseMinutes" = CASE
        WHEN ${minutes}::float IS NULL THEN notify_stats."responseMinutes"
        WHEN notify_stats."responseMinutes" IS NULL THEN ${minutes}::float
        ELSE notify_stats."responseMinutes" * 0.7 + ${minutes}::float * 0.3
      END,
      "lastRespondedAt" = COALESCE(${respondedAt}, notify_stats."lastRespondedAt"),
      "decayedAt" = now()
  `;
}

const REQUEST_TYPES = ['NEW_COLLECTION', 'RE_NOTIFY'] as const;

/**
 * The person opened a collection they were asked to help with. Counted once per collection:
 * the unread request entries flip to read, and only that flip counts.
 */
export async function recordOpened(db: PrismaClient, userId: string, collectionId: string): Promise<void> {
  const res = await db.notification.updateMany({
    where: { userId, collectionId, type: { in: [...REQUEST_TYPES] }, status: 'UNREAD' },
    data: { status: 'READ' },
  });
  if (res.count > 0) await bump(db, userId, 'opened', null);
}

/** Opening the entry in the feed: the same signal, found by the notification id. */
export async function recordOpenedById(db: PrismaClient, userId: string, notificationId: string): Promise<void> {
  const row = await db.notification.findFirst({
    where: { id: notificationId, userId, type: { in: [...REQUEST_TYPES] } },
    select: { collectionId: true },
  });
  if (row) await recordOpened(db, userId, row.collectionId);
}

/** Swiping away a request entry. */
export async function recordDismissed(db: PrismaClient, userId: string, notificationId: string): Promise<void> {
  const row = await db.notification.findFirst({
    where: { id: notificationId, userId, type: { in: [...REQUEST_TYPES] }, status: { in: ['UNREAD', 'READ'] } },
    select: { id: true },
  });
  if (row) await bump(db, userId, 'dismissed', null);
}

/**
 * Joining a collection the person was asked to help with. Counted for the first pledge only;
 * the time is measured from the first request entry they got for it.
 */
export async function recordResponded(db: PrismaClient, userId: string, collectionId: string): Promise<void> {
  const [first, pledges] = await Promise.all([
    db.notification.findFirst({
      where: { userId, collectionId, type: { in: [...REQUEST_TYPES] } },
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    }),
    db.obligation.count({ where: { userId, collectionId } }),
  ]);
  if (!first || pledges > 1) return;
  const minutes = Math.max(0, (Date.now() - first.createdAt.getTime()) / 60_000);
  await bump(db, userId, 'responded', minutes);
}

/* ---------- Routing ---------- */

export interface WavePlan {
  /** Get the external message; their number never exceeds the wave budget */
  external: BfsRecipient[];
  /** Get only the in-app entry */
  inApp: BfsRecipient[];
}

/** Why a person is held back from the external message this time (null = may get it). */
async function holdReasons(db: PrismaClient, ids: string[]): Promise<Map<string, string | null>> {
  const now = Date.now();
  const [users, reachable, stats, recent] = await Promise.all([
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, monthlyBudget: true, remainingBudget: true } }),
    reachableForNewCollections(db, ids),
    db.notifyStats.findMany({ where: { userId: { in: ids } }, select: { userId: true, ignoreStreak: true, lastSentAt: true } }),
    db.$queryRaw<Array<{ userId: string; day: bigint; week: bigint }>>`
      SELECT "userId",
        COUNT(*) FILTER (WHERE "createdAt" >= ${new Date(now - DAY_MS)})::bigint AS day,
        COUNT(*)::bigint AS week
      FROM notification_deliveries
      WHERE "userId" = ANY(${ids}) AND "eventKey" LIKE 'col:%:new' AND "createdAt" >= ${new Date(now - 7 * DAY_MS)}
      GROUP BY "userId"
    `,
  ]);
  const budget = new Map(users.map((u) => [u.id, u]));
  const stat = new Map(stats.map((s) => [s.userId, s]));
  const freq = new Map(recent.map((r) => [r.userId, { day: Number(r.day), week: Number(r.week) }]));

  const out = new Map<string, string | null>();
  for (const id of ids) {
    const u = budget.get(id);
    const s = stat.get(id);
    const f = freq.get(id);
    let reason: string | null = null;
    if (!reachable.has(id)) reason = 'unreachable';
    // Budget set and used up for this period; people who never set one are not held back
    else if (u && (u.monthlyBudget ?? 0) > 0 && (u.remainingBudget ?? 0) <= 0) reason = 'budget';
    else if (f && (f.day >= FREQ_DAY || f.week >= FREQ_WEEK)) reason = 'frequency';
    else if (s && s.ignoreStreak >= IGNORE_LIMIT && s.lastSentAt && now - s.lastSentAt.getTime() < PROBE_AFTER_DAYS * DAY_MS) {
      reason = 'ignoring';
    }
    out.set(id, reason);
  }
  return out;
}

/**
 * Splits the people a wave can reach (BFS order, nearest first, whole reach) into external and in-app.
 * Ring by ring: the ones who may get the message go first, in BFS order, until the budget is spent.
 * The others in a ring the wave fully covered get the in-app entry; the wave stops inside the ring
 * where the budget ends, and the rest of that ring waits for the next wave.
 */
export async function planWave(db: PrismaClient, candidates: BfsRecipient[], budget: number): Promise<WavePlan> {
  const plan: WavePlan = { external: [], inApp: [] };
  let i = 0;
  while (i < candidates.length && plan.external.length < budget) {
    const depth = candidates[i]!.depth;
    const ring: BfsRecipient[] = [];
    while (i < candidates.length && candidates[i]!.depth === depth) ring.push(candidates[i++]!);

    const reasons = await holdReasons(db, ring.map((r) => r.userId));
    const free = ring.filter((r) => reasons.get(r.userId) == null);
    const held = ring.filter((r) => reasons.get(r.userId) != null);
    const room = budget - plan.external.length;
    plan.external.push(...free.slice(0, room));
    // In-app entries do not spend the budget but are bounded by it too: a small request must not
    // land in the feeds of the whole network when few people can be reached outside the app
    if (free.length <= room) plan.inApp.push(...held.slice(0, Math.max(0, budget - plan.inApp.length)));
  }
  return plan;
}
