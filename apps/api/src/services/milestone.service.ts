import type { PrismaClient } from '@so/db';

/**
 * Money MVP milestones (SO-44): the first confirmed connection and 10 direct confirmed connections.
 *
 * - Only Connection rows count: sent invite links and pending requests never do.
 * - A milestone is recorded once per user (unique userId+kind), so repeated events,
 *   sign-ins or a second device never create a second one.
 * - It is a historical fact: if a connection is removed later the milestone stays,
 *   while the current number of connections is shown next to it.
 * - No money, activity or rating is involved, and nothing is sent outside the app.
 */
export const MILESTONES = [
  { kind: 'FIRST_CONNECTION', threshold: 1 },
  { kind: 'TEN_CONNECTIONS', threshold: 10 },
] as const;

export type MilestoneKind = (typeof MILESTONES)[number]['kind'];

/**
 * Records milestones the user has reached but that are not stored yet.
 * `restored: true` is used when catching up from saved connections (old accounts, read path):
 * such milestones are stored as already seen, so no "new milestone" confirmation pops up for them.
 * Returns the kinds created by this call.
 */
export async function syncMilestones(
  db: PrismaClient,
  userId: string,
  opts: { restored?: boolean } = {},
): Promise<MilestoneKind[]> {
  const existing = await db.userMilestone.findMany({ where: { userId }, select: { kind: true } });
  const have = new Set(existing.map((m) => m.kind));
  const missing = MILESTONES.filter((m) => !have.has(m.kind));
  if (missing.length === 0) return [];

  const maxThreshold = Math.max(...missing.map((m) => m.threshold));
  // Oldest first: the N-th connection is the one that reached the N-th threshold.
  const connections = await db.connection.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    orderBy: { createdAt: 'asc' },
    take: maxThreshold,
    select: { userAId: true, userBId: true, createdAt: true },
  });

  const created: MilestoneKind[] = [];
  for (const m of missing) {
    const reaching = connections[m.threshold - 1];
    if (!reaching) continue;
    const res = await db.userMilestone.createMany({
      data: [{
        userId,
        kind: m.kind,
        achievedAt: reaching.createdAt,
        relatedUserId: reaching.userAId === userId ? reaching.userBId : reaching.userAId,
        seenAt: opts.restored ? new Date() : null,
      }],
      skipDuplicates: true, // another request recorded it first — keep that one
    });
    if (res.count > 0) created.push(m.kind);
  }
  return created;
}

/** Call right after a connection between two users is created. Never throws. */
export async function syncMilestonesForPair(db: PrismaClient, a: string, b: string): Promise<void> {
  await Promise.all([a, b].map((id) =>
    syncMilestones(db, id).catch((err) => console.error('[milestones] sync failed for', id, err)),
  ));
}
