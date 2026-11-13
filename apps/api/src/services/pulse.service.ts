import type { PrismaClient } from '@so/db';
import { getGraph } from './graph-cache.service.js';
import { ACCEPTED_RECENT_MS, SEEN_GRACE_MS } from '../routers/pending.router.js';

/**
 * "What changed" for an open app: one light request instead of a timer per list. Every group below is a
 * fingerprint of one polled list: it changes when that list would change, and the client re-reads only the
 * lists whose group differs from the previous answer. Numbers and times only (epoch ms, 0 = none), never
 * names or contents. Reads only: every query is answered from an index of the person's own rows, or from
 * the graph in memory (connections), and they run in parallel.
 */
/** Each group is null when its query failed this time: the client then keeps its previous value for it. */
export interface Pulse {
  /** notification.list / unreadCount / attention: notices still on the list (UNREAD or READ). */
  notifications: { active: number; unread: number; live: number; changedAt: number } | null;
  /** pending.incoming: connection requests waiting for my answer. */
  incoming: { count: number; latestAt: number } | null;
  /** pending.myPending: my own requests still waiting. */
  outgoing: { count: number; latestAt: number } | null;
  /** pending.acceptedRecent: my requests the other person confirmed, as that list sees them. */
  accepted: { count: number; unseen: number; latestAt: number } | null;
  /** collection.myActive: my own active or paused Needs and the pledges on them. */
  mine: NeedStamp | null;
  /** collection.myParticipating: the Needs I pledged to and every pledge on them. */
  participating: NeedStamp | null;
  /** milestone.list. */
  milestones: { reached: number; unseen: number; latestAt: number } | null;
  /** moderation.myOpenReviews: open circle questions addressed to me. */
  reviews: { open: number; due: number; votes: number } | null;
  /** connection.getCount: my confirmed connections. */
  connections: { count: number } | null;
}

export interface NeedStamp {
  count: number;
  /** Newest change of the Needs themselves (status, goal, cycle) */
  changedAt: number;
  pledges: number;
  /** Sum of the active pledges: an amount changed in place moves no time */
  pledged: number;
  confirmed: number;
  /** Newest pledge made, withdrawn or marked as received */
  pledgeAt: number;
}

const ms = (d: Date | null | undefined): number => (d ? new Date(d).getTime() : 0);
const num = (v: unknown): number => (v == null ? 0 : Number(v));

type NeedRow = {
  count: number;
  changed_at: Date | null;
  pledges: number;
  pledged: number | null;
  confirmed: number;
  made_at: Date | null;
  left_at: Date | null;
  confirmed_at: Date | null;
};

function needStamp(row: NeedRow | undefined): NeedStamp {
  return {
    count: num(row?.count),
    changedAt: ms(row?.changed_at),
    pledges: num(row?.pledges),
    // Rounded to cents: a float sum must not differ between two identical states
    pledged: Math.round(num(row?.pledged) * 100) / 100,
    confirmed: num(row?.confirmed),
    pledgeAt: Math.max(ms(row?.made_at), ms(row?.left_at), ms(row?.confirmed_at)),
  };
}

export async function getPulse(db: PrismaClient, userId: string): Promise<Pulse> {
  const now = Date.now();
  // Prisma stores times as UTC in `timestamp` columns while a Date parameter arrives as timestamptz: raw
  // comparisons convert it with AT TIME ZONE 'UTC', so the session time zone cannot shift them
  const nowDate = new Date(now);
  const acceptedSince = new Date(now - ACCEPTED_RECENT_MS);
  const seenSince = new Date(now - SEEN_GRACE_MS);

  // Settled one by one: a query that fails leaves its group out (null) instead of failing the whole pulse,
  // so the other lists keep refreshing
  const settled = await Promise.allSettled([
    // notifications(userId, status) index; the Need's own updatedAt catches a Need closed or paused under a notice
    db.$queryRaw<Array<{ active: number; unread: number; live: number; notice_at: Date | null; need_at: Date | null }>>`
      SELECT count(*)::int AS active,
             count(*) FILTER (WHERE n.status = 'UNREAD')::int AS unread,
             count(*) FILTER (WHERE n."expiresAt" > (${nowDate}::timestamptz AT TIME ZONE 'UTC'))::int AS live,
             max(n."updatedAt") AS notice_at,
             max(c."updatedAt") AS need_at
      FROM notifications n
      JOIN collections c ON c.id = n."collectionId"
      WHERE n."userId" = ${userId} AND n.status IN ('UNREAD', 'READ')`,
    db.pendingConnection.aggregate({
      where: { toUserId: userId, status: 'PENDING' },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.pendingConnection.aggregate({
      where: { fromUserId: userId, status: 'PENDING' },
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    // The same filter as pending.acceptedRecent, so a row leaving it (seen long ago, dismissed) moves the count
    db.pendingConnection.aggregate({
      where: {
        fromUserId: userId,
        status: 'ACCEPTED',
        resolvedAt: { gte: acceptedSince },
        requesterDismissedAt: null,
        OR: [{ requesterSeenAt: null }, { requesterSeenAt: { gte: seenSince } }],
        toUser: { deletedAt: null },
      },
      _count: { _all: true, requesterSeenAt: true },
      _max: { resolvedAt: true },
    }),
    db.$queryRaw<NeedRow[]>`
      SELECT count(DISTINCT c.id)::int AS count,
             max(c."updatedAt") AS changed_at,
             count(o.id)::int AS pledges,
             sum(o.amount) FILTER (WHERE o."unsubscribedAt" IS NULL)::float8 AS pledged,
             count(o."confirmedAt")::int AS confirmed,
             max(o."createdAt") AS made_at,
             max(o."unsubscribedAt") AS left_at,
             max(o."confirmedAt") AS confirmed_at
      FROM collections c
      LEFT JOIN obligations o ON o."collectionId" = c.id
      WHERE c."creatorId" = ${userId} AND c.status IN ('ACTIVE', 'BLOCKED')`,
    // My active pledges (obligations.userId index) and, for each of their Needs, every pledge on it
    db.$queryRaw<NeedRow[]>`
      SELECT count(DISTINCT m.id)::int AS count,
             max(c."updatedAt") AS changed_at,
             count(o.id)::int AS pledges,
             sum(o.amount) FILTER (WHERE o."unsubscribedAt" IS NULL)::float8 AS pledged,
             count(o."confirmedAt")::int AS confirmed,
             max(o."createdAt") AS made_at,
             max(o."unsubscribedAt") AS left_at,
             max(o."confirmedAt") AS confirmed_at
      FROM obligations m
      JOIN collections c ON c.id = m."collectionId"
      LEFT JOIN obligations o ON o."collectionId" = c.id
      WHERE m."userId" = ${userId} AND m."unsubscribedAt" IS NULL`,
    db.userMilestone.aggregate({
      where: { userId },
      _count: { _all: true, seenAt: true },
      _max: { achievedAt: true },
    }),
    // Open reviews are few (collection_reviews(status, closesAt) index); `due` moves when one is past its
    // time, so the list is read and closes it (closing happens there, the pulse writes nothing)
    db.$queryRaw<Array<{ open: number; due: number; votes: number }>>`
      SELECT count(DISTINCT r.id)::int AS open,
             count(DISTINCT r.id) FILTER (WHERE r."closesAt" <= (${nowDate}::timestamptz AT TIME ZONE 'UTC'))::int AS due,
             count(v.id)::int AS votes
      FROM collection_reviews r
      LEFT JOIN collection_review_votes v ON v."reviewId" = r.id
      WHERE r.status = 'OPEN' AND ${userId} = ANY(r."audienceIds")`,
    getGraph(db),
  ]);
  const names = ['notifications', 'incoming', 'outgoing', 'accepted', 'mine', 'participating', 'milestones', 'reviews', 'connections'];
  const failures = settled.flatMap((r, i) => (r.status === 'rejected' ? [`${names[i]}: ${String((r.reason as Error)?.message ?? r.reason).slice(0, 160)}`] : []));
  if (failures.length > 0) console.error('[pulse] groups failed:', failures.join('; '));
  const value = <T>(r: PromiseSettledResult<T>): T | null => (r.status === 'fulfilled' ? r.value : null);
  const [notices, incoming, outgoing, accepted, mine, participating, milestones, reviews, graph] = [
    value(settled[0]), value(settled[1]), value(settled[2]), value(settled[3]), value(settled[4]),
    value(settled[5]), value(settled[6]), value(settled[7]), value(settled[8]),
  ] as const;

  const n = notices?.[0];
  const node = graph?.find(userId);
  return {
    notifications: notices
      ? { active: num(n?.active), unread: num(n?.unread), live: num(n?.live), changedAt: Math.max(ms(n?.notice_at), ms(n?.need_at)) }
      : null,
    incoming: incoming ? { count: incoming._count._all, latestAt: ms(incoming._max.createdAt) } : null,
    outgoing: outgoing ? { count: outgoing._count._all, latestAt: ms(outgoing._max.createdAt) } : null,
    accepted: accepted
      ? {
          count: accepted._count._all,
          unseen: accepted._count._all - accepted._count.requesterSeenAt,
          latestAt: ms(accepted._max.resolvedAt),
        }
      : null,
    mine: mine ? needStamp(mine[0]) : null,
    participating: participating ? needStamp(participating[0]) : null,
    milestones: milestones
      ? {
          reached: milestones._count._all,
          unseen: milestones._count._all - milestones._count.seenAt,
          latestAt: ms(milestones._max.achievedAt),
        }
      : null,
    reviews: reviews ? { open: num(reviews[0]?.open), due: num(reviews[0]?.due), votes: num(reviews[0]?.votes) } : null,
    connections: graph ? { count: node === undefined ? 0 : graph.degree(node) } : null,
  };
}
