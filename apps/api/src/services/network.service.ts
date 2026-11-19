import type { PrismaClient } from '@so/db';
import { getGraph, graphVersion, onGraphInvalidated } from './graph-cache.service.js';
import type { HandshakeGraph } from './graph-store.js';
import { measure, ReachKeeper, stillReusable, type FarCount, type FarSnapshot, type NetworkReach } from './network-figure.js';
import { timedWalk } from './runtime-metrics.service.js';

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
  const graph = await getGraph(db);
  const root = graph.find(rootId);
  const out: NetworkMember[] = [];
  if (root === undefined || limit <= 0) return out;
  graph.walk(root, maxDepth, (n, depth, newestAt) => {
    out.push({ user_id: graph.ids[n]!, depth, max_conn_at: newestAt > 0 ? new Date(newestAt) : null });
    return out.length < limit;
  });
  return out;
}

export {
  NETWORK_MAX_DEPTH,
  VISIBLE_RINGS,
  roundFarCount,
  type FarCount,
  type NetworkReach,
} from './network-figure.js';

/**
 * The network figure as every screen shows it, and nothing finer: people up to the 6th handshake (rings 1–3
 * exactly, the 4th to 6th as one rounded count), and the sum of what they can still give.
 */
export function publicFigure(reach: NetworkReach): {
  people: number;
  canHelp: number;
  rings: { 1: number; 2: number; 3: number };
  far: FarCount;
} {
  return {
    people: reach.people,
    canHelp: reach.canHelp,
    rings: { 1: reach.byDepth[1] ?? 0, 2: reach.byDepth[2] ?? 0, 3: reach.byDepth[3] ?? 0 },
    far: reach.far,
  };
}

/* ---------- What people can give, kept beside the graph ---------- */

/**
 * Remaining budgets of everyone who set one. Read in full once, then kept up to date from the rows that
 * changed: a sum over a reach is a loop over an array indexed by the person's number in the graph, with
 * no query per walk and no list of ids sent to the database.
 * - every BUDGET_SYNC_MS: accounts whose row changed since the last look (a budget is always changed
 *   through an ordinary update, which moves `updatedAt`);
 * - at once: people named by a graph invalidation (a newcomer's budget counts in their inviter's number
 *   on the next request) and people who just changed their own budget (`noteBudgetChanged`);
 * - every BUDGET_FULL_MS: everything again, as a safety net.
 */
const BUDGET_SYNC_MS = 60_000;
const BUDGET_FULL_MS = 30 * 60_000;
const BUDGET_CHUNK = 50_000;
/** Read this far back on every sync: rows committed while the previous one ran are not missed. */
const BUDGET_OVERLAP_MS = 5_000;

const budgetOf = new Map<string, number>();
let budgetSyncedAt = 0;
let budgetFullAt = 0;
let budgetLoading: Promise<void> | null = null;
const budgetDirty = new Set<string>();

/** The same budgets as an array by person number, for the graph they were laid out for. */
let budgetValues = new Float32Array(0);
let budgetGraph: HandshakeGraph | null = null;
let budgetFilled = 0;

/** A person changed what they can give: their number is read again before the next sum. */
export function noteBudgetChanged(userId: string): void {
  budgetDirty.add(userId);
}

onGraphInvalidated((userIds) => {
  if (userIds) for (const id of userIds) budgetDirty.add(id);
});

function applyBudget(userId: string, value: number | null, deleted: boolean): void {
  const amount = !deleted && value && value > 0 ? value : 0;
  if (amount > 0) budgetOf.set(userId, amount);
  else budgetOf.delete(userId);
  const n = budgetGraph?.find(userId);
  if (n !== undefined && n < budgetFilled) budgetValues[n] = amount;
}

async function syncBudgets(db: PrismaClient): Promise<void> {
  const now = Date.now();
  if (budgetFullAt === 0 || now - budgetFullAt >= BUDGET_FULL_MS) {
    const startedAt = now;
    const fresh = new Map<string, number>();
    // In chunks by the primary key, so a large table is neither one query nor one array
    for (let after = ''; ; ) {
      const rows = await db.user.findMany({
        where: { remainingBudget: { gt: 0 }, deletedAt: null, id: { gt: after } },
        select: { id: true, remainingBudget: true },
        orderBy: { id: 'asc' },
        take: BUDGET_CHUNK,
      });
      for (const r of rows) fresh.set(r.id, r.remainingBudget ?? 0);
      if (rows.length < BUDGET_CHUNK) break;
      after = rows[rows.length - 1]!.id;
    }
    budgetOf.clear();
    for (const [id, value] of fresh) budgetOf.set(id, value);
    budgetFilled = 0; // the array is laid out again from the new map
    budgetFullAt = startedAt;
    budgetSyncedAt = startedAt;
    budgetDirty.clear();
    return;
  }
  if (now - budgetSyncedAt >= BUDGET_SYNC_MS) {
    const since = new Date(budgetSyncedAt - BUDGET_OVERLAP_MS);
    const rows = await db.user.findMany({
      where: { updatedAt: { gte: since } },
      select: { id: true, remainingBudget: true, deletedAt: true },
    });
    for (const r of rows) applyBudget(r.id, r.remainingBudget, r.deletedAt != null);
    budgetSyncedAt = now;
  }
  if (budgetDirty.size > 0) {
    const ids = [...budgetDirty];
    budgetDirty.clear();
    const rows = await db.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, remainingBudget: true, deletedAt: true },
    });
    const found = new Set(rows.map((r) => r.id));
    for (const r of rows) applyBudget(r.id, r.remainingBudget, r.deletedAt != null);
    // An account that is gone gives nothing
    for (const id of ids) if (!found.has(id)) applyBudget(id, 0, true);
  }
}

async function freshBudgets(db: PrismaClient): Promise<void> {
  if (!budgetLoading) budgetLoading = syncBudgets(db).finally(() => { budgetLoading = null; });
  return budgetLoading;
}

/** Remaining budgets of everyone who has one, by user id (admin clusters). */
export async function remainingBudgets(db: PrismaClient): Promise<Map<string, number>> {
  await freshBudgets(db);
  return budgetOf;
}

/**
 * Budgets by person number of `graph`. People who joined the graph since the last call are filled in.
 *
 * Synchronous on purpose, and the caller must walk the graph before its next `await`: the array is one
 * shared buffer, and a request holding another graph (around a full reload, which renumbers everyone)
 * lays it out again for its own graph as soon as it runs.
 */
function budgetsFor(graph: HandshakeGraph): Float32Array {
  if (budgetGraph !== graph) {
    budgetGraph = graph;
    budgetFilled = 0;
  }
  if (budgetValues.length < graph.size) {
    const grown = new Float32Array(Math.ceil(graph.size * 1.5) + 16);
    grown.set(budgetValues.subarray(0, budgetFilled));
    budgetValues = grown;
  }
  for (let n = budgetFilled; n < graph.size; n++) budgetValues[n] = budgetOf.get(graph.ids[n]!) ?? 0;
  budgetFilled = graph.size;
  return budgetValues;
}

/* ---------- The reach ---------- */

/**
 * One answer: the graph and the budgets are acquired once, then (synchronously) the visible rings are walked
 * with the kept far part when that is safe, or the whole reach is walked on the same graph and budgets.
 */
async function walkReach(
  db: PrismaClient,
  rootId: string,
  reuse: { entry: ReachEntry; far: FarSnapshot } | null,
): Promise<{ value: NetworkReach; far: FarSnapshot; reused: boolean }> {
  const graph = await getGraph(db);
  await freshBudgets(db);
  // No await from here to the end of the walk (see budgetsFor). The kept far part is taken only if it is still
  // the one that was kept with its list: the keeper may have dropped the list while this walk waited above
  const far = reuse ? stillReusable(reachCache, rootId, reuse.entry, reuse.far) : null;
  return measure(graph, graph.find(rootId), budgetsFor(graph), far);
}

/**
 * A walk up to the 6th handshake touches most of a large network, and every screen asks for it
 * (Circle, Profile, My intention, the Need screen, each of them on a timer). One walk gives the network
 * figure and the request gate. The numbers are kept per person:
 * - while nothing in the graph changed, for REACH_TTL_MS (only the budgets inside the sum can move);
 * - after the graph changed somewhere, for REACH_STALE_MS at most; then the visible rings 1–3 are walked
 *   again (a few hundred or thousand people) and the far rings 4–6, which are shown as one rounded count,
 *   are reused for up to REACH_FAR_TTL_MS, in networks whose far part is at least REACH_FAR_REUSE_MIN people.
 *   The reuse is refused, and everything walked again on the same graph, when the people of the graph as it
 *   was at the full walk who are in rings 1–3 are not exactly the same as then (their numbers are kept beside
 *   the far part, checked one by one): someone who crossed could be counted in both parts or in neither.
 *   What the reuse can still miss is change inside the far rings only: people joining or leaving rings 4–6,
 *   accounts deleted there, and changed budgets there, for up to an hour;
 * - a person whose own connections changed is dropped at once (invalidateGraph passes the ids),
 *   so their own new acquaintance is in the numbers on the next request, far rings included.
 * Server-side thresholds (the path to a request) use the same value: exact for the person's own
 * connections and the visible rings, at most an hour behind for the far ones (and only in networks of
 * REACH_FAR_REUSE_MIN people or more, far above the threshold).
 *
 * Memory of the exact check: 4 bytes per person in rings 1–3 per kept answer, none above NEAR_IDS_MAX people
 * (200 KB), and REACH_NEAR_IDS_BUDGET numbers (16 MB) over all kept answers: past it, the oldest answers lose
 * their list but stay kept (they are walked in full when stale instead of reusing the far part).
 */
const REACH_TTL_MS = 5 * 60_000;
const REACH_STALE_MS = Number(process.env.REACH_STALE_MS) || 60_000;
const REACH_FAR_TTL_MS = 60 * 60_000;
/** The far part is reused only when it is this large: a small network costs nothing to walk in full. */
const REACH_FAR_REUSE_MIN = process.env.REACH_FAR_REUSE_MIN !== undefined ? Number(process.env.REACH_FAR_REUSE_MIN) : 500;
const REACH_CACHE_MAX = 20_000;
const REACH_NEAR_IDS_BUDGET = 4_000_000;

interface ReachEntry {
  value: NetworkReach;
  at: number;
  version: number;
  far: FarSnapshot;
  farAt: number;
}

/** The kept answers; their rings 1-3 lists are limited separately (ReachKeeper, network-figure.ts). */
const reachCache = new ReachKeeper<ReachEntry>(REACH_CACHE_MAX, REACH_NEAR_IDS_BUDGET);
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
  const now = Date.now();
  if (isReachDirty(rootId, now)) return timedWalk('reach', async () => (await walkReach(db, rootId, null)).value);
  const hit = reachCache.get(rootId);
  if (hit) {
    const age = now - hit.at;
    if (age < REACH_STALE_MS || (age < REACH_TTL_MS && hit.version === graphVersion())) return hit.value;
  }
  const pending = reachLoading.get(rootId);
  if (pending) return pending;

  const epoch = reachEpoch;
  const reuseFar = hit && now - hit.farAt < REACH_FAR_TTL_MS && hit.far.people >= REACH_FAR_REUSE_MIN ? hit : null;
  const promise = timedWalk('reach', async () => {
    const result = await walkReach(db, rootId, reuseFar ? { entry: reuseFar, far: reuseFar.far } : null);
    if (epoch === reachEpoch) {
      const farAt = result.reused && reuseFar ? reuseFar.farAt : Date.now();
      reachCache.set(rootId, { value: result.value, at: Date.now(), version: graphVersion(), far: result.far, farAt });
    }
    return result.value;
  }).finally(() => reachLoading.delete(rootId));
  reachLoading.set(rootId, promise);
  return promise;
}
