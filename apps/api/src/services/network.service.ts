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
 * How far a request for help travels: the waves go out from the author, nearest first, up to this many
 * handshakes. "Your network" everywhere in the app means exactly these people.
 */
export const NETWORK_MAX_DEPTH = 6;
/** Rings whose people are shown by name (graph, People lists). Beyond them only rounded counts. */
export const VISIBLE_RINGS = 3;

export type FarCount = { count: number; approx: boolean; few: boolean };

/**
 * Rounds a count of people the viewer may not see, so it cannot be used to tell when one
 * particular person joined or left: under 5 is only "a few", then steps of 10, 50, then 2 significant digits.
 */
export function roundFarCount(n: number): FarCount {
  if (n <= 0) return { count: 0, approx: false, few: false };
  if (n < 5) return { count: 0, approx: true, few: true };
  const step = n < 100 ? 10 : n < 1000 ? 50 : 10 ** (Math.floor(Math.log10(n)) - 1);
  const count = Math.max(step, Math.round(n / step) * step);
  return { count, approx: true, few: false };
}

/**
 * How many people are at each handshake from rootId, up to NETWORK_MAX_DEPTH (no cap on the count).
 * Only numbers leave this function: who is beyond the visible rings stays private.
 */
export async function countNetworkByDepth(
  db: PrismaClient,
  rootId: string,
): Promise<{ byDepth: Record<number, number>; total: number; ids: string[] }> {
  const { adj, deleted } = await getGraph(db);
  const seen = new Set<string>([rootId]);
  const byDepth: Record<number, number> = {};
  const ids: string[] = [];
  let frontier = [rootId];
  for (let depth = 1; depth <= NETWORK_MAX_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const userId of frontier) {
      for (const { neighbor } of adj.get(userId) || []) {
        if (seen.has(neighbor) || deleted.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    if (next.length > 0) byDepth[depth] = next.length;
    ids.push(...next);
    frontier = next;
  }
  return { byDepth, total: ids.length, ids };
}

/**
 * The one set of network numbers every screen shows (home, profile, the ask screen):
 * - `shown`: people in the network, the visible rings exactly and the far part rounded once
 *   (an exact total would reveal how many are in the private far rings);
 * - `exact`: the same without rounding, for server-side thresholds only;
 * - `canHelp`: the sum of what these people can still give this period (remaining budgets).
 * The person themselves is not counted in either.
 */
export async function networkReach(
  db: PrismaClient,
  rootId: string,
): Promise<{ byDepth: Record<number, number>; exact: number; shown: number; canHelp: number }> {
  const { byDepth, total, ids } = await countNetworkByDepth(db, rootId);
  let visible = 0;
  for (let depth = 1; depth <= VISIBLE_RINGS; depth++) visible += byDepth[depth] ?? 0;
  const far = total - visible;
  const shown = visible + (far > 0 ? Math.max(roundFarCount(far).count, 1) : 0);
  let canHelp = 0;
  if (ids.length > 0) {
    const rows = await db.$queryRaw<Array<{ total: number | null }>>`
      SELECT COALESCE(SUM("remainingBudget"), 0)::float AS total
      FROM users WHERE id = ANY(${ids}) AND "remainingBudget" > 0
    `;
    canHelp = Math.round(rows[0]?.total ?? 0);
  }
  return { byDepth, exact: total, shown, canHelp };
}
