import type { PrismaClient } from '@so/db';

/**
 * The whole handshake graph, kept in process memory.
 *
 * Every network walk used to load the full `connections` table, which grows with the platform, not with
 * one person's network. Now the table is read once and re-read only when it has changed: a cheap
 * signature query (row count, newest connection, deleted users) runs at most every CHECK_MS, and code
 * that changes connections in this process calls `invalidateGraph()` so its own changes show at once.
 * Changes made elsewhere (another replica, a script) show within CHECK_MS.
 *
 * When connections were only added (the usual case), the new rows are appended to the graph in memory
 * instead of reading the whole table again; a removed connection or a deleted account reloads it.
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

/** After an invalidation, every read re-checks the signature for this long (see invalidateGraph). */
const DIRTY_MS = 3_000;

/**
 * A connection's `createdAt` is the start of its transaction, so a row can commit with a time slightly
 * before the newest one already loaded. The append reads this far back; the count check catches the rest.
 */
const APPEND_OVERLAP_MS = 60_000;

let cached: { graph: Graph; signature: Signature; checkedAt: number } | null = null;
let loading: { generation: number; promise: Promise<Graph> } | null = null;
let generation = 0;
let dirtyUntil = 0;
let cachedGeneration = -1;
/** Grows every time the graph's content changes (reload or append): derived caches compare it. */
let version = 0;

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
 * Call when connections were created or deleted. Often this runs inside a transaction that has not
 * committed yet, so dropping the cache alone is not enough: a read before the commit would cache the
 * old rows again. Instead, for a short window every read re-checks the signature, and the first read
 * after the commit sees the change and reloads.
 *
 * `userIds`: the people whose own connections changed, when the caller knows them. Their derived
 * numbers are dropped at once; without ids every derived number is dropped.
 */
export function invalidateGraph(userIds?: string[]): void {
  generation++;
  dirtyUntil = Date.now() + DIRTY_MS;
  for (const listener of invalidationListeners) listener(userIds);
}

async function readSignature(db: PrismaClient): Promise<Signature> {
  const rows = await db.$queryRaw<Array<{ c: bigint; m: Date | null; d: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM connections)::bigint AS c,
      (SELECT MAX("createdAt") FROM connections) AS m,
      (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)::bigint AS d
  `;
  const row = rows[0];
  return { count: Number(row?.c ?? 0), maxAt: row?.m?.getTime() ?? 0, deleted: Number(row?.d ?? 0) };
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

async function load(db: PrismaClient): Promise<{ graph: Graph; signature: Signature }> {
  // Signature first: a change that lands while the rows are read makes the next check reload again
  const signature = await readSignature(db);
  const [connections, deletedUsers] = await Promise.all([
    db.connection.findMany({ select: { userAId: true, userBId: true, createdAt: true } }),
    db.user.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
  ]);
  const graph: Graph = { adj: new Map(), deleted: new Set(deletedUsers.map((u) => u.id)), edgeCount: 0 };
  for (const c of connections) addEdge(graph, c.userAId, c.userBId, c.createdAt);
  return { graph, signature };
}

/**
 * Connections were only added since `prev`: read the new rows and append them. Returns false when the
 * result does not add up to the table (something was also removed, or a row landed outside the window):
 * the caller then reloads everything.
 */
async function appendNew(db: PrismaClient, graph: Graph, prev: Signature, next: Signature): Promise<boolean> {
  if (next.deleted !== prev.deleted || next.count <= prev.count || next.maxAt < prev.maxAt) return false;
  const rows = await db.connection.findMany({
    where: { createdAt: { gte: new Date(prev.maxAt - APPEND_OVERLAP_MS), lte: new Date(next.maxAt) } },
    select: { userAId: true, userBId: true, createdAt: true },
  });
  // The graph is shared, so it is only touched once the numbers are known to add up
  const fresh = rows.filter((c) => !graph.adj.get(c.userAId)?.some((e) => e.neighbor === c.userBId));
  if (graph.edgeCount + fresh.length !== next.count) return false;
  for (const c of fresh) addEdge(graph, c.userAId, c.userBId, c.createdAt);
  return graph.edgeCount === next.count;
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
        const signature = await readSignature(db);
        if (sameSignature(signature, prev.signature)) {
          prev.checkedAt = Date.now();
          return prev.graph;
        }
        // Still the newest graph (no reload replaced it meanwhile): try to append the new rows
        if (cached === prev && (await appendNew(db, prev.graph, prev.signature, signature))) {
          prev.signature = signature;
          prev.checkedAt = Date.now();
          version++;
          return prev.graph;
        }
      }
      const fresh = await load(db);
      // Keep only the newest load: an older one finishing late must not replace it
      if (!cached || startedAt >= cachedGeneration) {
        cached = { ...fresh, checkedAt: Date.now() };
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
