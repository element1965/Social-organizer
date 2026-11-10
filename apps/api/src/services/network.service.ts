import type { PrismaClient } from '@so/db';
import { getGraph, graphVersion, onGraphInvalidated } from './graph-cache.service.js';

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
    // No spread: a ring can hold more people than a call may take arguments
    for (const id of next) ids.push(id);
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
export interface NetworkReach {
  byDepth: Record<number, number>;
  exact: number;
  shown: number;
  /** People in the visible rings 1–3 (exact: they are shown by name) */
  visible: number;
  /** People beyond the visible rings, rounded the same way as `shown` */
  farShown: number;
  /** Ceiling: what everyone up to the 6th handshake can still give */
  canHelp: number;
  /** What the visible rings 1–3 can give: the part a person can check by eye */
  canHelpVisible: number;
}

/**
 * A walk up to the 6th handshake touches most of a large network, and every screen asks for it
 * (home, profile, the ask screen, each of them on a timer). The numbers are kept per person:
 * - while nothing in the graph changed, for REACH_TTL_MS (only the budgets inside the sum can move);
 * - after the graph changed somewhere, for REACH_STALE_MS at most, so far rings catch up within a minute;
 * - a person whose own connections changed is dropped at once (invalidateGraph passes the ids),
 *   so their own new acquaintance is in the numbers on the next request.
 * Server-side thresholds (the path to a request) use the same value: it is at most a minute behind
 * for far rings and exact for the person's own connections.
 */
const REACH_TTL_MS = 5 * 60_000;
const REACH_STALE_MS = 60_000;
const REACH_CACHE_MAX = 20_000;

const reachCache = new Map<string, { value: NetworkReach; at: number; version: number }>();
const reachLoading = new Map<string, Promise<NetworkReach>>();
/** Bumped when entries are dropped, so a walk that started before does not store an old answer. */
let reachEpoch = 0;

/**
 * An invalidation often comes from inside a transaction that has not committed yet. For this long after
 * it, the people named in it are answered with a fresh walk every time and nothing is kept for them,
 * so a walk that ran just before the commit cannot stay as their number.
 */
const REACH_DIRTY_MS = 3_000;
const reachDirty = new Map<string, number>();
let reachAllDirtyUntil = 0;

function isReachDirty(rootId: string, now: number): boolean {
  if (now < reachAllDirtyUntil) return true;
  const until = reachDirty.get(rootId);
  if (until === undefined) return false;
  if (now < until) return true;
  reachDirty.delete(rootId);
  return false;
}

onGraphInvalidated((userIds) => {
  reachEpoch++;
  const until = Date.now() + REACH_DIRTY_MS;
  if (!userIds) {
    reachCache.clear();
    reachDirty.clear();
    reachAllDirtyUntil = until;
    return;
  }
  if (reachDirty.size > 10_000) reachDirty.clear();
  for (const id of userIds) {
    reachCache.delete(id);
    reachDirty.set(id, until);
  }
});

/** Drops every kept reach (a person changed what they can give, tests). */
export function clearReachCache(userIds?: string[]): void {
  reachEpoch++;
  if (!userIds) reachCache.clear();
  else for (const id of userIds) reachCache.delete(id);
}

export async function networkReach(db: PrismaClient, rootId: string): Promise<NetworkReach> {
  if (isReachDirty(rootId, Date.now())) return computeNetworkReach(db, rootId);
  const hit = reachCache.get(rootId);
  if (hit) {
    const age = Date.now() - hit.at;
    if (age < REACH_STALE_MS || (age < REACH_TTL_MS && hit.version === graphVersion())) return hit.value;
  }
  const pending = reachLoading.get(rootId);
  if (pending) return pending;

  const epoch = reachEpoch;
  const promise = computeNetworkReach(db, rootId)
    .then((value) => {
      if (epoch === reachEpoch) {
        if (reachCache.size >= REACH_CACHE_MAX) {
          // Oldest entries first (a Map keeps insertion order)
          let drop = REACH_CACHE_MAX / 10;
          for (const key of reachCache.keys()) {
            reachCache.delete(key);
            if (--drop <= 0) break;
          }
        }
        reachCache.delete(rootId);
        reachCache.set(rootId, { value, at: Date.now(), version: graphVersion() });
      }
      return value;
    })
    .finally(() => reachLoading.delete(rootId));
  reachLoading.set(rootId, promise);
  return promise;
}

/**
 * Remaining budgets of everyone who has one, for sums over very large reaches: sending hundreds of
 * thousands of ids to the database for every person costs more than reading the budgets once a minute.
 */
const BUDGET_SNAPSHOT_MS = 60_000;
const BUDGET_SQL_MAX_IDS = 5_000;
let budgetSnapshot: { at: number; byUser: Map<string, number> } | null = null;
let budgetLoading: Promise<Map<string, number>> | null = null;

async function remainingBudgets(db: PrismaClient): Promise<Map<string, number>> {
  if (budgetSnapshot && Date.now() - budgetSnapshot.at < BUDGET_SNAPSHOT_MS) return budgetSnapshot.byUser;
  if (!budgetLoading) {
    budgetLoading = db.user
      .findMany({ where: { remainingBudget: { gt: 0 }, deletedAt: null }, select: { id: true, remainingBudget: true } })
      .then((rows) => {
        const byUser = new Map(rows.map((r) => [r.id, r.remainingBudget ?? 0]));
        budgetSnapshot = { at: Date.now(), byUser };
        return byUser;
      })
      .finally(() => { budgetLoading = null; });
  }
  return budgetLoading;
}

async function computeNetworkReach(db: PrismaClient, rootId: string): Promise<NetworkReach> {
  const { byDepth, total, ids } = await countNetworkByDepth(db, rootId);
  let visible = 0;
  for (let depth = 1; depth <= VISIBLE_RINGS; depth++) visible += byDepth[depth] ?? 0;
  const far = total - visible;
  // A handful beyond the rings ("a few" in the chips) is still counted as it is, so the headline does not understate
  const farShown = far > 0 ? (roundFarCount(far).few ? far : roundFarCount(far).count) : 0;
  const shown = visible + farShown;
  let canHelp = 0;
  let canHelpVisible = 0;
  if (ids.length > BUDGET_SQL_MAX_IDS) {
    // ids come in handshake order, so the first `visible` of them are exactly the rings 1–3
    const budgets = await remainingBudgets(db);
    for (let i = 0; i < ids.length; i++) {
      const b = budgets.get(ids[i]!);
      if (!b) continue;
      canHelp += b;
      if (i < visible) canHelpVisible += b;
    }
    canHelp = Math.round(canHelp);
    canHelpVisible = Math.round(canHelpVisible);
  } else if (ids.length > 0) {
    // ids come in handshake order, so the first `visible` of them are exactly the rings 1–3
    const visibleIds = ids.slice(0, visible);
    const rows = await db.$queryRaw<Array<{ total: number | null; visible_total: number | null }>>`
      SELECT COALESCE(SUM("remainingBudget"), 0)::float AS total,
             COALESCE(SUM("remainingBudget") FILTER (WHERE id = ANY(${visibleIds})), 0)::float AS visible_total
      FROM users WHERE id = ANY(${ids}) AND "remainingBudget" > 0
    `;
    canHelp = Math.round(rows[0]?.total ?? 0);
    canHelpVisible = Math.round(rows[0]?.visible_total ?? 0);
  }
  return { byDepth, exact: total, shown, visible, farShown, canHelp, canHelpVisible };
}
