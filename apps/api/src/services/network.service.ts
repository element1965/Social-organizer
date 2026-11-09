import type { PrismaClient } from '@so/db';

export interface NetworkMember {
  user_id: string;
  depth: number;
  max_conn_at: Date | null;
}

/**
 * Breadth-first walk over confirmed connections from rootId, self and soft-deleted users excluded.
 * Single source for the dashboard network stats and the ask thresholds, so both show the same numbers.
 * The result is hard-capped at `limit` people (BFS order).
 */
export async function bfsNetwork(db: PrismaClient, rootId: string, limit = 500): Promise<NetworkMember[]> {
  // In-memory BFS: load all connections, traverse in JS (no temp files)
  const allConns = await db.connection.findMany({
    select: { userAId: true, userBId: true, createdAt: true },
  });
  const adj = new Map<string, Array<{ neighbor: string; createdAt: Date }>>();
  for (const c of allConns) {
    if (!adj.has(c.userAId)) adj.set(c.userAId, []);
    if (!adj.has(c.userBId)) adj.set(c.userBId, []);
    adj.get(c.userAId)!.push({ neighbor: c.userBId, createdAt: c.createdAt });
    adj.get(c.userBId)!.push({ neighbor: c.userAId, createdAt: c.createdAt });
  }

  const deletedUsers = new Set(
    (await db.user.findMany({ where: { deletedAt: { not: null } }, select: { id: true } })).map((u) => u.id),
  );

  const visited = new Map<string, { depth: number; maxConnAt: Date }>();
  const queue: Array<{ userId: string; depth: number; maxConnAt: Date }> = [];
  for (const { neighbor, createdAt } of adj.get(rootId) || []) {
    if (neighbor === rootId || deletedUsers.has(neighbor)) continue;
    if (!visited.has(neighbor)) {
      visited.set(neighbor, { depth: 1, maxConnAt: createdAt });
      queue.push({ userId: neighbor, depth: 1, maxConnAt: createdAt });
    }
  }
  let qi = 0;
  while (qi < queue.length && visited.size < limit) {
    const { userId, depth, maxConnAt } = queue[qi++]!;
    if (depth >= 99) continue;
    for (const { neighbor, createdAt } of adj.get(userId) || []) {
      if (neighbor === rootId || visited.has(neighbor) || deletedUsers.has(neighbor)) continue;
      const newMax = createdAt > maxConnAt ? createdAt : maxConnAt;
      visited.set(neighbor, { depth: depth + 1, maxConnAt: newMax });
      queue.push({ userId: neighbor, depth: depth + 1, maxConnAt: newMax });
    }
  }

  return Array.from(visited.entries())
    .slice(0, limit)
    .map(([user_id, v]) => ({ user_id, depth: v.depth, max_conn_at: v.maxConnAt as Date | null }));
}
