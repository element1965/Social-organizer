import type { PrismaClient } from '@so/db';

/**
 * The whole handshake graph, kept in process memory.
 *
 * Every network walk used to load the full `connections` table, which grows with the platform, not with
 * one person's network. Now the table is read once and re-read only when it has changed. A signature
 * says whether it has: the newest connection and the number of deleted accounts (both answered from
 * indexes) are looked at at most every CHECK_MS; the number of connections, which costs a pass over the
 * table, is counted only when something changed, right after an `invalidateGraph()`, and once every
 * EXACT_MS. Code that changes connections in this process calls `invalidateGraph()`, so its own changes
 * show at once. Changes made elsewhere (another replica, a script) show within CHECK_MS, except a
 * connection removed elsewhere, which shows within EXACT_MS.
 *
 * A change is brought into the graph in the cheapest way that adds up to the table:
 * 1. the people named by `invalidateGraph(ids)` are re-read (their rows only): a removed connection,
 *    a deleted or restored account, a new connection;
 * 2. connections added by someone else are appended from the newest rows;
 * 3. only when neither adds up to the signature is the whole table read again.
 * Callers must treat the graph as read-only: it is shared.
 */

export interface Edge {
  neighbor: string;
  createdAt: Date;
}

export interface Graph {
  adj: Map<string, Edge[]>;
  /** Deleted accounts: never part of anyone's network. */
  deleted: Set<string>;
  /** Number of connections in `adj` (each counted once). */
  edgeCount: number;
}

interface Signature {
  count: number;
  maxAt: number;
  deleted: number;
}

const CHECK_MS = 5_000;

/** The exact signature (with the count of all connections) is read at least this often. */
const EXACT_MS = 60_000;

/** After an invalidation, every read re-checks the signature for this long (see invalidateGraph). */
const DIRTY_MS = 3_000;

/**
 * A connection's `createdAt` is the start of its transaction, so a row can commit with a time slightly
 * before the newest one already loaded. The append reads this far back; the count check catches the rest.
 */
const APPEND_OVERLAP_MS = 60_000;

/**
 * How long the people named by an invalidation are remembered. The call often comes from inside a
 * transaction that has not committed yet; the change is seen by the first signature check after the
 * commit, and by then the names must still be here.
 */
const PENDING_TTL_MS = Number(process.env.GRAPH_PENDING_TTL_MS) || 30_000;
/** More people than this waiting to be re-read: one full reload is cheaper and simpler. */
const PENDING_MAX = 2_000;

let cached: { graph: Graph; signature: Signature; checkedAt: number; exactAt: number } | null = null;
let loading: { generation: number; promise: Promise<Graph> } | null = null;
let generation = 0;
let dirtyUntil = 0;
let cachedGeneration = -1;
/** Grows every time the graph's content changes (reload, append or re-read): derived caches compare it. */
let version = 0;

/** People whose own connections or account changed in this process → when to forget the name. */
const pending = new Map<string, number>();

const stats = {
  fullLoads: 0,
  /** Periodic checks answered by the light signature alone */
  lightChecks: 0,
  appends: 0,
  refreshes: 0,
  lastLoadMs: 0,
  lastSignatureMs: 0,
};

/** Numbers for the runtime metrics line: how the graph is kept up to date and how big it is. */
export function graphStats(): typeof stats & { people: number; connections: number } {
  return { ...stats, people: cached?.graph.adj.size ?? 0, connections: cached?.graph.edgeCount ?? 0 };
}

const invalidationListeners: Array<(userIds?: string[]) => void> = [];

/** Derived caches (network reach) subscribe here to drop what an invalidation makes stale. */
export function onGraphInvalidated(listener: (userIds?: string[]) => void): void {
  invalidationListeners.push(listener);
}

/** Changes whenever the graph in memory changed. */
export function graphVersion(): number {
  return version;
}

/**
 * Call when connections were created or deleted, or an account was deleted or restored. Often this runs
 * inside a transaction that has not committed yet, so dropping the cache alone is not enough: a read
 * before the commit would cache the old rows again. Instead, for a short window every read re-checks
 * the signature, and the first read after the commit sees the change.
 *
 * `userIds`: the people whose own connections or account changed, when the caller knows them. Only
 * their rows are read again, and their derived numbers are dropped at once. Without ids the whole
 * table is read again and every derived number is dropped.
 */
export function invalidateGraph(userIds?: string[]): void {
  const now = Date.now();
  generation++;
  dirtyUntil = now + DIRTY_MS;
  if (userIds) {
    for (const id of userIds) pending.set(id, now + PENDING_TTL_MS);
    // Too many to re-read one by one: forget the names, the next change is found by a full reload
    if (pending.size > PENDING_MAX) pending.clear();
  }
  for (const listener of invalidationListeners) listener(userIds);
}

/** The people named by recent invalidations. A re-read of them is accepted only if the graph then adds up to the table. */
function pendingPeople(now: number): string[] {
  const ids: string[] = [];
  for (const [id, until] of pending) {
    if (until <= now) pending.delete(id);
    else ids.push(id);
  }
  return ids;
}

async function readSignature(db: PrismaClient): Promise<Signature> {
  const startedAt = performance.now();
  const rows = await db.$queryRaw<Array<{ c: bigint; m: Date | null; d: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM connections)::bigint AS c,
      (SELECT MAX("createdAt") FROM connections) AS m,
      (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)::bigint AS d
  `;
  stats.lastSignatureMs = Math.round(performance.now() - startedAt);
  const row = rows[0];
  return { count: Number(row?.c ?? 0), maxAt: row?.m?.getTime() ?? 0, deleted: Number(row?.d ?? 0) };
}

/**
 * The parts of the signature that indexes answer at once. A new connection moves the newest time and a
 * deleted or restored account moves the count; a removed connection moves neither, which is why the
 * exact signature still runs after every invalidation and every EXACT_MS.
 */
async function readLightSignature(db: PrismaClient): Promise<Pick<Signature, 'maxAt' | 'deleted'>> {
  const rows = await db.$queryRaw<Array<{ m: Date | null; d: bigint }>>`
    SELECT
      (SELECT MAX("createdAt") FROM connections) AS m,
      (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)::bigint AS d
  `;
  const row = rows[0];
  return { maxAt: row?.m?.getTime() ?? 0, deleted: Number(row?.d ?? 0) };
}

function sameSignature(a: Signature, b: Signature): boolean {
  return a.count === b.count && a.maxAt === b.maxAt && a.deleted === b.deleted;
}

/** Adds one connection to the graph; false when it is already there. */
function addEdge(graph: Graph, userAId: string, userBId: string, createdAt: Date): boolean {
  let a = graph.adj.get(userAId);
  if (!a) graph.adj.set(userAId, (a = []));
  else if (a.some((e) => e.neighbor === userBId)) return false;
  let b = graph.adj.get(userBId);
  if (!b) graph.adj.set(userBId, (b = []));
  a.push({ neighbor: userBId, createdAt });
  b.push({ neighbor: userAId, createdAt });
  graph.edgeCount++;
  return true;
}

/** Takes every connection of one person out of the graph, on both sides. */
function removePerson(graph: Graph, userId: string): void {
  const own = graph.adj.get(userId);
  if (!own) return;
  for (const { neighbor } of own) {
    const theirs = graph.adj.get(neighbor);
    if (theirs) {
      const at = theirs.findIndex((e) => e.neighbor === userId);
      if (at >= 0) theirs.splice(at, 1);
      if (theirs.length === 0) graph.adj.delete(neighbor);
    }
    graph.edgeCount--;
  }
  graph.adj.delete(userId);
}

async function load(db: PrismaClient): Promise<{ graph: Graph; signature: Signature }> {
  const startedAt = performance.now();
  // Signature first: a change that lands while the rows are read makes the next check reload again
  const signature = await readSignature(db);
  const [connections, deletedUsers] = await Promise.all([
    db.connection.findMany({ select: { userAId: true, userBId: true, createdAt: true } }),
    db.user.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
  ]);
  const graph: Graph = { adj: new Map(), deleted: new Set(deletedUsers.map((u) => u.id)), edgeCount: 0 };
  for (const c of connections) addEdge(graph, c.userAId, c.userBId, c.createdAt);
  stats.fullLoads++;
  stats.lastLoadMs = Math.round(performance.now() - startedAt);
  // The first load is the start-up; later ones are the expensive path the metrics watch for
  if (stats.fullLoads > 1) {
    console.log(`[graph] full reload: ${graph.edgeCount} connections, ${graph.adj.size} people, ${stats.lastLoadMs} ms`);
  }
  return { graph, signature };
}

/**
 * Connections were only added since the graph was brought up to date: read the newest rows and append
 * them. Returns false when the result does not add up to the table (something was also removed, or a
 * row landed outside the window): the caller then reloads everything.
 */
async function appendNew(db: PrismaClient, graph: Graph, sinceMs: number, next: Signature): Promise<boolean> {
  if (graph.deleted.size !== next.deleted || next.count <= graph.edgeCount || next.maxAt < sinceMs) return false;
  const rows = await db.connection.findMany({
    where: { createdAt: { gte: new Date(sinceMs - APPEND_OVERLAP_MS), lte: new Date(next.maxAt) } },
    select: { userAId: true, userBId: true, createdAt: true },
  });
  // The graph is shared, so it is only touched once the numbers are known to add up
  const fresh = rows.filter((c) => !graph.adj.get(c.userAId)?.some((e) => e.neighbor === c.userBId));
  if (graph.edgeCount + fresh.length !== next.count) return false;
  for (const c of fresh) addEdge(graph, c.userAId, c.userBId, c.createdAt);
  return graph.edgeCount === next.count;
}

/**
 * The people named by invalidateGraph changed: read their rows and their account state again and put
 * exactly that into the graph. Covers a removed connection, a deleted or restored account and a new
 * connection, without touching anyone else. True when the graph then adds up to the table.
 */
async function refreshPeople(db: PrismaClient, graph: Graph, ids: string[], next: Signature): Promise<boolean> {
  const [rows, users] = await Promise.all([
    db.connection.findMany({
      where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] },
      select: { userAId: true, userBId: true, createdAt: true },
    }),
    db.user.findMany({ where: { id: { in: ids } }, select: { id: true, deletedAt: true } }),
  ]);
  // No await from here on: readers never see a person half re-read
  for (const id of ids) removePerson(graph, id);
  for (const c of rows) addEdge(graph, c.userAId, c.userBId, c.createdAt);
  const deletedNow = new Set(users.filter((u) => u.deletedAt).map((u) => u.id));
  for (const id of ids) {
    // An account that no longer exists at all is simply gone: it has no connections left either
    if (deletedNow.has(id)) graph.deleted.add(id);
    else graph.deleted.delete(id);
  }
  return graph.edgeCount === next.count && graph.deleted.size === next.deleted;
}

/** The current graph. Concurrent callers share one load. */
export async function getGraph(db: PrismaClient): Promise<Graph> {
  const now = Date.now();
  const dirty = now < dirtyUntil;
  if (cached && !dirty && now - cached.checkedAt < CHECK_MS) return cached.graph;
  // A read started before an invalidation may miss that change, so it is not shared after one
  if (loading && loading.generation === generation && !dirty) return loading.promise;

  const startedAt = generation;
  const entry: { generation: number; promise: Promise<Graph> } = { generation: startedAt, promise: undefined as never };
  entry.promise = (async () => {
    try {
      const prev = cached;
      if (prev) {
        // Nothing was changed here and the exact count is recent: the light parts are enough to say "no change"
        if (!dirty && pendingPeople(Date.now()).length === 0 && Date.now() - prev.exactAt < EXACT_MS) {
          const light = await readLightSignature(db);
          if (light.maxAt === prev.signature.maxAt && light.deleted === prev.signature.deleted) {
            stats.lightChecks++;
            prev.checkedAt = Date.now();
            return prev.graph;
          }
        }
        const signature = await readSignature(db);
        prev.exactAt = Date.now();
        if (sameSignature(signature, prev.signature)) {
          prev.checkedAt = Date.now();
          return prev.graph;
        }
        const accept = (kind: 'appends' | 'refreshes') => {
          prev.signature = signature;
          prev.checkedAt = Date.now();
          stats[kind]++;
          version++;
          return prev.graph;
        };
        // Still the newest graph (no reload replaced it meanwhile): bring the change in without a reload
        const people = pendingPeople(Date.now());
        const named = people.length > 0;
        if (cached === prev && named && (await refreshPeople(db, prev.graph, people, signature))) return accept('refreshes');
        // Connections added by someone else (or in the same moment as the re-read): the newest rows cover
        // them. The count check makes this safe whatever else happened: it only passes for pure additions.
        if (cached === prev && (await appendNew(db, prev.graph, prev.signature.maxAt, signature))) {
          return accept(named ? 'refreshes' : 'appends');
        }
      }
      const fresh = await load(db);
      // Keep only the newest load: an older one finishing late must not replace it
      if (!cached || startedAt >= cachedGeneration) {
        cached = { ...fresh, checkedAt: Date.now(), exactAt: Date.now() };
        cachedGeneration = startedAt;
        version++;
      }
      return fresh.graph;
    } finally {
      if (loading === entry) loading = null;
    }
  })();
  loading = entry;
  return entry.promise;
}
