import type { PrismaClient } from '@so/db';
import { getGraph } from './graph-cache.service.js';

export interface NetworkMember {
  user_id: string;
  depth: number;
  max_conn_at: Date | null;
}

/**
 * Breadth-first walk over confirmed connections from rootId, self and soft-deleted users excluded.
 * Single source for the dashboard network stats and the ask thresholds, so both show the same numbers.
 * Stops at `maxDepth` handshakes; the result is hard-capped at `limit` people (BFS order).
 */
export async function bfsNetwork(
  db: PrismaClient,
  rootId: string,
  limit = 500,
  maxDepth = Infinity,
): Promise<NetworkMember[]> {
  const { adj, deleted } = await getGraph(db);

  const visited = new Map<string, { depth: number; maxConnAt: Date }>();
  const queue: Array<{ userId: string; depth: number; maxConnAt: Date }> = [];
  for (const { neighbor, createdAt } of adj.get(rootId) || []) {
    if (neighbor === rootId || deleted.has(neighbor) || visited.has(neighbor)) continue;
    visited.set(neighbor, { depth: 1, maxConnAt: createdAt });
    queue.push({ userId: neighbor, depth: 1, maxConnAt: createdAt });
  }
  let qi = 0;
  while (qi < queue.length && visited.size < limit) {
    const { userId, depth, maxConnAt } = queue[qi++]!;
    if (depth >= maxDepth) continue;
    for (const { neighbor, createdAt } of adj.get(userId) || []) {
      if (neighbor === rootId || visited.has(neighbor) || deleted.has(neighbor)) continue;
      const newMax = createdAt > maxConnAt ? createdAt : maxConnAt;
      visited.set(neighbor, { depth: depth + 1, maxConnAt: newMax });
      queue.push({ userId: neighbor, depth: depth + 1, maxConnAt: newMax });
    }
  }

  return Array.from(visited.entries())
    .slice(0, limit)
    .map(([user_id, v]) => ({ user_id, depth: v.depth, max_conn_at: v.maxConnAt as Date | null }));
}

/**
 * How many people are at each handshake from rootId, over the whole network (no cap).
 * Only numbers leave this function: who is beyond the visible rings stays private.
 */
export async function countNetworkByDepth(db: PrismaClient, rootId: string): Promise<{ byDepth: Record<number, number>; total: number }> {
  const { adj, deleted } = await getGraph(db);
  const seen = new Set<string>([rootId]);
  const byDepth: Record<number, number> = {};
  let frontier = [rootId];
  let depth = 0;
  while (frontier.length > 0) {
    depth++;
    const next: string[] = [];
    for (const userId of frontier) {
      for (const { neighbor } of adj.get(userId) || []) {
        if (seen.has(neighbor) || deleted.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    if (next.length > 0) byDepth[depth] = next.length;
    frontier = next;
  }
  return { byDepth, total: seen.size - 1 };
}
