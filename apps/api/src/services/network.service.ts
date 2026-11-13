import type { PrismaClient } from '@so/db';
import { getGraph, graphVersion, onGraphInvalidated } from './graph-cache.service.js';
import type { HandshakeGraph } from './graph-store.js';
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

/** Budgets by person number of `graph`. People who joined the graph since the last call are filled in. */
async function budgetsFor(db: PrismaClient, graph: HandshakeGraph): Promise<Float32Array> {
  await freshBudgets(db);
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

interface Measure {
  byDepth: Record<number, number>;
  people: number;
  canHelp: number;
  /** The part of `canHelp` that comes from the visible rings */
  nearCanHelp?: number;
}

/** People and budgets from `root`, ring by ring, up to `maxDepth`. Synchronous: the budgets are in hand. */
function measure(graph: HandshakeGraph, root: number, budgets: Float32Array, maxDepth: number): Measure {
  const t = graph.tally(root, maxDepth, budgets, VISIBLE_RINGS);
  const byDepth: Record<number, number> = {};
  for (let depth = 1; depth <= maxDepth; depth++) if (t.byDepth[depth]! > 0) byDepth[depth] = t.byDepth[depth]!;
  return { byDepth, people: t.people, canHelp: t.weight, nearCanHelp: t.nearWeight };
}

/** The far part of a reach (rings beyond the visible ones), kept apart so it can be reused. */
interface FarPart {
  byDepth: Record<number, number>;
  people: number;
  canHelp: number;
}

function compose(near: Measure, far: FarPart): NetworkReach {
  const visible = near.people;
  // A handful beyond the rings ("a few" in the chips) is still counted as it is, so the headline does not understate
  const rounded = roundFarCount(far.people);
  const farShown = far.people > 0 ? (rounded.few ? far.people : rounded.count) : 0;
  return {
    byDepth: { ...near.byDepth, ...far.byDepth },
    exact: visible + far.people,
    shown: visible + farShown,
    visible,
    farShown,
    canHelp: Math.round(near.canHelp + far.canHelp),
    canHelpVisible: Math.round(near.canHelp),
  };
}

const NOBODY: Measure = { byDepth: {}, people: 0, canHelp: 0 };

/** The whole reach, to the 6th handshake: one walk, split into the visible rings and the far ones. */
async function fullReach(db: PrismaClient, rootId: string): Promise<{ value: NetworkReach; far: FarPart }> {
  const graph = await getGraph(db);
  const budgets = await budgetsFor(db, graph);
  const root = graph.find(rootId);
  const all = root === undefined ? NOBODY : measure(graph, root, budgets, NETWORK_MAX_DEPTH);
  const near: Measure = { byDepth: {}, people: 0, canHelp: all.nearCanHelp ?? 0 };
  const far: FarPart = { byDepth: {}, people: 0, canHelp: all.canHelp - near.canHelp };
  for (const [key, n] of Object.entries(all.byDepth)) {
    const part = Number(key) <= VISIBLE_RINGS ? near : far;
    part.byDepth[Number(key)] = n;
    part.people += n;
  }
  return { value: compose(near, far), far };
}

/** Only the visible rings are walked again; the far part is the one measured earlier. */
async function nearReach(db: PrismaClient, rootId: string, far: FarPart): Promise<NetworkReach> {
  const graph = await getGraph(db);
  const budgets = await budgetsFor(db, graph);
  const root = graph.find(rootId);
  return compose(root === undefined ? NOBODY : measure(graph, root, budgets, VISIBLE_RINGS), far);
}

/**
 * A walk up to the 6th handshake touches most of a large network, and every screen asks for it
 * (home, profile, the ask screen, each of them on a timer). The numbers are kept per person:
 * - while nothing in the graph changed, for REACH_TTL_MS (only the budgets inside the sum can move);
 * - after the graph changed somewhere, for REACH_STALE_MS at most; then the visible rings 1–3 are walked
 *   again (a few hundred or thousand people) and the far rings, which are shown rounded anyway, are
 *   reused for up to REACH_FAR_TTL_MS;
 * - a person whose own connections changed is dropped at once (invalidateGraph passes the ids),
 *   so their own new acquaintance is in the numbers on the next request, far rings included.
 * Server-side thresholds (the path to a request) use the same value: exact for the person's own
 * connections and the visible rings, at most an hour behind for the far ones.
 */
const REACH_TTL_MS = 5 * 60_000;
const REACH_STALE_MS = Number(process.env.REACH_STALE_MS) || 60_000;
const REACH_FAR_TTL_MS = 60 * 60_000;
const REACH_CACHE_MAX = 20_000;

interface ReachEntry {
  value: NetworkReach;
  at: number;
  version: number;
  far: FarPart;
  farAt: number;
}

const reachCache = new Map<string, ReachEntry>();
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
  if (isReachDirty(rootId, now)) return timedWalk('reach', async () => (await fullReach(db, rootId)).value);
  const hit = reachCache.get(rootId);
  if (hit) {
    const age = now - hit.at;
    if (age < REACH_STALE_MS || (age < REACH_TTL_MS && hit.version === graphVersion())) return hit.value;
  }
  const pending = reachLoading.get(rootId);
  if (pending) return pending;

  const epoch = reachEpoch;
  const reuseFar = hit && now - hit.farAt < REACH_FAR_TTL_MS ? hit : null;
  const promise = timedWalk('reach', async () => {
    const result = reuseFar
      ? { value: await nearReach(db, rootId, reuseFar.far), far: reuseFar.far, farAt: reuseFar.farAt }
      : { ...(await fullReach(db, rootId)), farAt: Date.now() };
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
      reachCache.set(rootId, { value: result.value, at: Date.now(), version: graphVersion(), far: result.far, farAt: result.farAt });
    }
    return result.value;
  }).finally(() => reachLoading.delete(rootId));
  reachLoading.set(rootId, promise);
  return promise;
}
