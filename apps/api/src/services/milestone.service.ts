import type { PrismaClient } from '@so/db';
import { getAskAccess } from './ask-access.service.js';

/**
 * Milestones: a record of what actually changed for a person, in the order it usually happens.
 *
 * - FIRST_CONNECTION: the first confirmed connection. A Need can now reach somebody.
 * - NEED_UNLOCKED: the circle and the network reached the thresholds of the Need tab (ASK_MIN_DIRECT direct
 *   connections and ASK_MIN_NETWORK people in the network), so the person can report a Need.
 * - FIRST_NEED: the person reported their first Need.
 * - FIRST_PARTICIPATION: the person reported their first Participation in somebody else's Need.
 *
 * Rules:
 * - Only stored facts count: Connection, Collection and Obligation rows. Invite links and pending requests never do.
 * - A milestone is recorded once per user (unique userId+kind) and stays: removing a connection or closing a Need
 *   later does not take it back.
 * - There are no milestones for amounts or for the number of people, no ratings, and nothing is sent outside the app.
 * - TEN_CONNECTIONS (the old second milestone) stays in the enum for rows written before; it opened nothing, is no
 *   longer recorded and is never shown.
 */
export const MILESTONES = ['FIRST_CONNECTION', 'NEED_UNLOCKED', 'FIRST_NEED', 'FIRST_PARTICIPATION'] as const;

export type MilestoneKind = (typeof MILESTONES)[number];

type Fact = { at: Date; relatedUserId?: string | null; knownBefore?: boolean };

/** A milestone found while catching up is announced only if it happened within this time. */
const FRESH_MS = 24 * 60 * 60 * 1000;

async function findFact(db: PrismaClient, userId: string, kind: MilestoneKind): Promise<Fact | null> {
  switch (kind) {
    case 'FIRST_CONNECTION': {
      const first = await db.connection.findFirst({
        where: { OR: [{ userAId: userId }, { userBId: userId }] },
        orderBy: { createdAt: 'asc' },
        select: { userAId: true, userBId: true, createdAt: true },
      });
      if (!first) return null;
      return { at: first.createdAt, relatedUserId: first.userAId === userId ? first.userBId : first.userAId };
    }
    case 'NEED_UNLOCKED': {
      const access = await getAskAccess(db, userId, { quick: true });
      if (!access.allowed) return null;
      // The moment the thresholds were crossed is not stored anywhere, so the fact is dated when it is first seen.
      // Somebody who has already reported a Need could do it by then at the latest: dated by that Need, recorded,
      // never announced.
      const asked = await db.collection.findFirst({
        where: { creatorId: userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return asked ? { at: asked.createdAt, knownBefore: true } : { at: new Date() };
    }
    case 'FIRST_NEED': {
      const first = await db.collection.findFirst({
        where: { creatorId: userId },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return first ? { at: first.createdAt } : null;
    }
    case 'FIRST_PARTICIPATION': {
      const first = await db.obligation.findFirst({
        where: { userId, collection: { creatorId: { not: userId } } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      return first ? { at: first.createdAt } : null;
    }
  }
}

/**
 * Records milestones the user has reached but that are not stored yet. Returns the kinds created by this call.
 *
 * - default: the milestone was reached by what just happened, so it is stored as not seen (the feed row and the
 *   short confirmation follow);
 * - `restored`: catching up on the read path (old accounts, a missed sync). Facts older than a day are stored as
 *   seen, so nobody is congratulated on something from last year;
 * - `silent`: always stored as seen (the caller shows its own result).
 */
export async function syncMilestones(
  db: PrismaClient,
  userId: string,
  opts: { restored?: boolean; silent?: boolean } = {},
): Promise<MilestoneKind[]> {
  const existing = await db.userMilestone.findMany({ where: { userId }, select: { kind: true } });
  const have = new Set<string>(existing.map((m) => m.kind));
  const missing = MILESTONES.filter((kind) => !have.has(kind));
  if (missing.length === 0) return [];

  const now = Date.now();
  const created: MilestoneKind[] = [];
  for (const kind of missing) {
    const fact = await findFact(db, userId, kind);
    if (!fact) continue;
    const old = now - fact.at.getTime() > FRESH_MS;
    const seen = opts.silent || fact.knownBefore || (opts.restored && old);
    const res = await db.userMilestone.createMany({
      data: [{
        userId,
        kind,
        achievedAt: fact.at,
        relatedUserId: fact.relatedUserId ?? null,
        seenAt: seen ? new Date() : null,
      }],
      skipDuplicates: true, // another request recorded it first — keep that one
    });
    if (res.count > 0) created.push(kind);
  }
  return created;
}

/** Call right after a connection between two users is created. Never throws. */
export async function syncMilestonesForPair(db: PrismaClient, a: string, b: string): Promise<void> {
  await Promise.all([a, b].map((id) => syncMilestonesQuietly(db, id)));
}

/** Call right after something that may reach a milestone (a new Need, a new Participation). Never throws. */
export async function syncMilestonesQuietly(db: PrismaClient, userId: string): Promise<void> {
  await syncMilestones(db, userId).catch((err) => console.error('[milestones] sync failed for', userId, err));
}
