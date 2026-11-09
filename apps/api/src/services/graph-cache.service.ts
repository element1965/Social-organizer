import type { PrismaClient } from '@so/db';

/**
 * The whole handshake graph, kept in process memory.
 *
 * Every network walk used to load the full `connections` table, which grows with the platform, not with
 * one person's network. Now the table is read once and re-read only when it has changed: a cheap
 * signature query (row count, newest connection, deleted users) runs at most every CHECK_MS, and code
 * that changes connections in this process calls `invalidateGraph()` so its own changes show at once.
 * Changes made elsewhere (another replica, a script) show within CHECK_MS.
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
}

const CHECK_MS = 5_000;

/** After an invalidation, every read re-checks the signature for this long (see invalidateGraph). */
const DIRTY_MS = 3_000;

let cached: { graph: Graph; signature: string; checkedAt: number } | null = null;
let loading: { generation: number; promise: Promise<Graph> } | null = null;
let generation = 0;
let dirtyUntil = 0;
let cachedGeneration = -1;

/**
 * Call when connections were created or deleted. Often this runs inside a transaction that has not
 * committed yet, so dropping the cache alone is not enough: a read before the commit would cache the
 * old rows again. Instead, for a short window every read re-checks the signature, and the first read
 * after the commit sees the change and reloads.
 */
export function invalidateGraph(): void {
  generation++;
  dirtyUntil = Date.now() + DIRTY_MS;
}

async function readSignature(db: PrismaClient): Promise<string> {
  const rows = await db.$queryRaw<Array<{ c: bigint; m: Date | null; d: bigint }>>`
    SELECT
      (SELECT COUNT(*) FROM connections)::bigint AS c,
      (SELECT MAX("createdAt") FROM connections) AS m,
      (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)::bigint AS d
  `;
  const row = rows[0];
  return `${row?.c ?? 0}:${row?.m?.getTime() ?? 0}:${row?.d ?? 0}`;
}

async function load(db: PrismaClient): Promise<{ graph: Graph; signature: string }> {
  // Signature first: a change that lands while the rows are read makes the next check reload again
  const signature = await readSignature(db);
  const [connections, deletedUsers] = await Promise.all([
    db.connection.findMany({ select: { userAId: true, userBId: true, createdAt: true } }),
    db.user.findMany({ where: { deletedAt: { not: null } }, select: { id: true } }),
  ]);
  const adj = new Map<string, Edge[]>();
  for (const c of connections) {
    let a = adj.get(c.userAId);
    if (!a) adj.set(c.userAId, (a = []));
    let b = adj.get(c.userBId);
    if (!b) adj.set(c.userBId, (b = []));
    a.push({ neighbor: c.userBId, createdAt: c.createdAt });
    b.push({ neighbor: c.userAId, createdAt: c.createdAt });
  }
  return { graph: { adj, deleted: new Set(deletedUsers.map((u) => u.id)) }, signature };
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
        if (signature === prev.signature) {
          prev.checkedAt = Date.now();
          return prev.graph;
        }
      }
      const fresh = await load(db);
      // Keep only the newest load: an older one finishing late must not replace it
      if (!cached || startedAt >= cachedGeneration) {
        cached = { ...fresh, checkedAt: Date.now() };
        cachedGeneration = startedAt;
      }
      return fresh.graph;
    } finally {
      if (loading === entry) loading = null;
    }
  })();
  loading = entry;
  return entry.promise;
}
