import type { PrismaClient } from '@so/db';
import { MAX_CONNECTIONS, SUGGEST_LIMIT, SUGGEST_MIN_MUTUAL } from '@so/shared';
import { getGraph } from './graph-cache.service.js';

export interface Suggestion {
  id: string;
  name: string;
  photoUrl: string | null;
  /** How many of the person's own acquaintances also know this one */
  mutualCount: number;
  /** Up to two of those shared acquaintances, to say through whom */
  via: Array<{ id: string; name: string }>;
}

/** More candidates than are shown: some drop out once requests and ignore entries are read. */
const CANDIDATE_POOL = 50;

/**
 * "You may know each other": people at the 2nd handshake who share at least SUGGEST_MIN_MUTUAL
 * acquaintances with the person, most shared first. They are already visible to the person by name
 * (rings 1–3), so nothing new is revealed; the list only saves the search.
 *
 * Never offered: someone the two already have a request with in any state (waiting, declined,
 * withdrawn), an ignore entry on either side, a deleted account, anyone at the 150 limit.
 */
export async function suggestAcquaintances(db: PrismaClient, userId: string): Promise<Suggestion[]> {
  const graph = await getGraph(db);
  const me = graph.find(userId);
  if (me === undefined) return [];
  const mine = graph.neighbours(me);
  if (mine.length === 0 || mine.length >= MAX_CONNECTIONS) return [];

  // Person numbers inside the walk; ids only for the few people that come out of it
  const direct = new Set(mine);
  const sharedByNumber = new Map<number, { via: string[]; newest: number }>();
  for (const acquaintance of mine) {
    if (graph.isDeleted(acquaintance)) continue;
    const viaId = graph.ids[acquaintance]!;
    graph.eachNeighbour(acquaintance, (other, madeAt) => {
      if (other === me || direct.has(other) || graph.isDeleted(other)) return;
      let entry = sharedByNumber.get(other);
      if (!entry) sharedByNumber.set(other, (entry = { via: [], newest: 0 }));
      entry.via.push(viaId);
      if (madeAt > entry.newest) entry.newest = madeAt;
    });
  }

  const pool = [...sharedByNumber.entries()]
    .filter(([n, s]) => s.via.length >= SUGGEST_MIN_MUTUAL && graph.degree(n) < MAX_CONNECTIONS)
    .map(([n, s]): [string, { via: string[]; newest: number }] => [graph.ids[n]!, s])
    .sort((a, b) => b[1].via.length - a[1].via.length || b[1].newest - a[1].newest || (a[0] < b[0] ? -1 : 1))
    .slice(0, CANDIDATE_POOL);
  if (pool.length === 0) return [];

  const ids = pool.map(([id]) => id);
  const [requests, ignores] = await Promise.all([
    db.pendingConnection.findMany({
      where: { OR: [{ fromUserId: userId, toUserId: { in: ids } }, { toUserId: userId, fromUserId: { in: ids } }] },
      select: { fromUserId: true, toUserId: true },
    }),
    db.ignoreEntry.findMany({
      where: { OR: [{ fromUserId: userId, toUserId: { in: ids } }, { toUserId: userId, fromUserId: { in: ids } }] },
      select: { fromUserId: true, toUserId: true },
    }),
  ]);
  const skip = new Set<string>();
  for (const row of [...requests, ...ignores]) skip.add(row.fromUserId === userId ? row.toUserId : row.fromUserId);

  const chosen = pool.filter(([id]) => !skip.has(id)).slice(0, SUGGEST_LIMIT);
  if (chosen.length === 0) return [];

  const needed = new Set<string>();
  for (const [id, s] of chosen) {
    needed.add(id);
    for (const viaId of s.via.slice(0, 2)) needed.add(viaId);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...needed] }, deletedAt: null },
    select: { id: true, name: true, photoUrl: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const out: Suggestion[] = [];
  for (const [id, s] of chosen) {
    const user = byId.get(id);
    if (!user) continue;
    out.push({
      id,
      name: user.name,
      photoUrl: user.photoUrl,
      mutualCount: s.via.length,
      via: s.via.slice(0, 2).flatMap((viaId) => {
        const v = byId.get(viaId);
        return v ? [{ id: v.id, name: v.name }] : [];
      }),
    });
  }
  return out;
}
