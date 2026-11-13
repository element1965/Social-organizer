import type { PrismaClient } from '@so/db';
import { getGraph } from './graph-cache.service.js';
import type { HandshakeGraph } from './graph-store.js';
import { NETWORK_MAX_DEPTH, VISIBLE_RINGS } from './network.service.js';

export interface BfsRecipient {
  userId: string;
  /** Handshake path from the start user to this person, both included. */
  path: string[];
  depth: number;
  maxConnAt: Date | null;
}

/**
 * One person reached by a ring-by-ring walk. The path is rebuilt from the walk's parent links only when
 * somebody reads it: a wave over a large network reaches far more people than it finally notifies.
 */
class RingEntry implements BfsRecipient {
  readonly userId: string;
  private built: string[] | null = null;

  constructor(
    private readonly graph: HandshakeGraph,
    private readonly person: number,
    readonly depth: number,
    private readonly parent: Int32Array,
    private readonly newestAt: number,
  ) {
    this.userId = graph.ids[person]!;
  }

  get maxConnAt(): Date | null {
    return this.newestAt > 0 ? new Date(this.newestAt) : null;
  }

  get path(): string[] {
    if (!this.built) {
      const out: string[] = new Array(this.depth + 1);
      let n = this.person;
      for (let i = this.depth; i >= 0 && n >= 0; i--) {
        out[i] = this.graph.ids[n]!;
        n = this.parent[n]!;
      }
      this.built = out;
    }
    return this.built;
  }
}

/**
 * Get all user IDs reachable from startUserId (the connected component), the start included.
 * Deleted accounts are a way through here, as before.
 */
export async function getNetworkUserIds(db: PrismaClient, startUserId: string): Promise<string[]> {
  const graph = await getGraph(db);
  const out = [startUserId];
  const root = graph.find(startUserId);
  if (root === undefined) return out;
  graph.walk(root, Infinity, (n) => {
    out.push(graph.ids[n]!);
  }, true);
  return out;
}

/**
 * The people a request reaches, nearest first (breadth-first over the cached graph), at most
 * `maxRecipients` of them and at most `maxDepth` handshakes away.
 *
 * Excluded people (already notified in an earlier wave, ignore list) are skipped as recipients but
 * still passed through: the next wave must reach the people behind the first wave, not stop at it.
 * Deleted accounts are neither recipients nor a way through.
 */
export async function findRecipientsViaBfs(
  db: PrismaClient,
  startUserId: string,
  maxDepth: number = NETWORK_MAX_DEPTH,
  maxRecipients: number = 10000,
  excludeUserIds: string[] = [],
): Promise<BfsRecipient[]> {
  const graph = await getGraph(db);
  const root = graph.find(startUserId);
  const recipients: BfsRecipient[] = [];
  if (root === undefined || maxRecipients <= 0) return recipients;
  const exclude = new Set(excludeUserIds);

  // The walk's arrays go back to a pool when the loop ends, so every path is built before that
  for (const ring of graph.rings(root, maxDepth, true)) {
    for (const person of ring.people) {
      if (exclude.has(graph.ids[person]!)) continue;
      const entry = new RingEntry(graph, person, ring.depth, ring.parent, ring.newestAt[person]!);
      void entry.path;
      recipients.push(entry);
      // The cap is exact: one notification per unit of the amount, never more
      if (recipients.length >= maxRecipients) return recipients;
    }
  }
  return recipients;
}

/**
 * The same walk as findRecipientsViaBfs, handed out one handshake ring at a time: the people at the
 * 1st handshake, then the 2nd, and so on, in the same order. A ring is computed only when it is asked
 * for, so a wave that spends its budget in the 2nd ring never walks the rest of the network.
 * Excluded people are passed through but are in no ring; a ring with nobody left is skipped.
 */
export async function walkRings(
  db: PrismaClient,
  startUserId: string,
  maxDepth: number = NETWORK_MAX_DEPTH,
  excludeUserIds: Iterable<string> = [],
): Promise<Generator<BfsRecipient[], void, void>> {
  const graph = await getGraph(db);
  const root = graph.find(startUserId);
  const exclude = excludeUserIds instanceof Set ? (excludeUserIds as Set<string>) : new Set(excludeUserIds);

  return (function* () {
    if (root === undefined) return;
    for (const ring of graph.rings(root, maxDepth)) {
      const out: BfsRecipient[] = [];
      for (const person of ring.people) {
        if (exclude.has(graph.ids[person]!)) continue;
        out.push(new RingEntry(graph, person, ring.depth, ring.parent, ring.newestAt[person]!));
      }
      if (out.length > 0) yield out;
    }
  })();
}

type PathPerson = {
  id: string;
  name: string;
  photoUrl: string | null;
  connectionCount: number;
  remainingBudget: number | null;
  /** A person beyond the viewer's visible rings: only their place in the chain is sent, never who they are */
  hidden?: boolean;
};

/**
 * BFS for finding shortest path between two users.
 *
 * Privacy: the chain may run beyond the 3rd handshake (a Need reaches the 6th, a person page can be opened
 * for anyone). People in it further than VISIBLE_RINGS from the viewer are sent as a placeholder with no
 * id, name, photo or numbers, so the length of the chain is known and who is in it is not. The viewer and
 * the person they asked about are always sent as they are: the viewer opened that person by id.
 */
export async function findPathBetweenUsers(
  db: PrismaClient,
  fromUserId: string,
  toUserId: string,
  maxDepth: number = 20,
): Promise<PathPerson[]> {
  const graph = await getGraph(db);
  const from = graph.find(fromUserId);
  const to = graph.find(toUserId);

  let fullPath: string[];
  if (fromUserId === toUserId) {
    fullPath = [fromUserId];
  } else {
    if (from === undefined || to === undefined) return [];
    let found = false;
    graph.walk(from, maxDepth, (n) => {
      if (n !== to) return;
      found = true;
      return false;
    }, true);
    if (!found) return [];
    // Read right away: the next walk on the graph reuses the same scratch
    fullPath = graph.pathOfLastWalk(to).map((n) => graph.ids[n]!);
  }

  const last = fullPath.length - 1;
  const hidden = (index: number) => index > VISIBLE_RINGS && index < last;
  const users = await db.user.findMany({
    where: { id: { in: fullPath.filter((_, index) => !hidden(index)) } },
    select: { id: true, name: true, photoUrl: true, remainingBudget: true },
  });
  const userMap = new Map(users.map((u) => [u.id, u]));
  const out: PathPerson[] = [];
  fullPath.forEach((id, index) => {
    if (hidden(index)) {
      out.push({ id: '', name: '', photoUrl: null, connectionCount: 0, remainingBudget: null, hidden: true });
      return;
    }
    const user = userMap.get(id);
    if (!user) return;
    const n = graph.find(id);
    out.push({ ...user, connectionCount: n === undefined ? 0 : graph.degree(n) });
  });
  return out;
}

/**
 * Get graph slice for 3D visualization.
 */
export async function getGraphSlice(
  db: PrismaClient,
  userId: string,
  depth: number = 3,
): Promise<{
  nodes: Array<{ id: string; name: string; photoUrl: string | null; depth: number; connectionCount: number; lastSeen: Date | null }>;
  edges: Array<{ from: string; to: string }>;
}> {
  const graph = await getGraph(db);
  const recipients = await findRecipientsViaBfs(db, userId, depth, 500, []);

  const userIds = new Set<string>([userId]);
  const edges: Array<{ from: string; to: string }> = [];
  const depthMap = new Map<string, number>();
  depthMap.set(userId, 0);

  for (const r of recipients) {
    userIds.add(r.userId);
    depthMap.set(r.userId, r.depth);
    for (let i = 0; i < r.path.length - 1; i++) {
      edges.push({ from: r.path[i]!, to: r.path[i + 1]! });
    }
  }

  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, photoUrl: true, lastSeen: true },
  });

  const nodes = users.map((u) => {
    const n = graph.find(u.id);
    return {
      id: u.id,
      name: u.name,
      photoUrl: u.photoUrl,
      depth: depthMap.get(u.id) ?? 0,
      // Direct connections, from the graph in memory
      connectionCount: n === undefined ? 0 : graph.degree(n),
      lastSeen: u.lastSeen,
    };
  });

  // Deduplicate edges
  const edgeSet = new Set<string>();
  const uniqueEdges: Array<{ from: string; to: string }> = [];
  for (const e of edges) {
    const [a, b] = [e.from, e.to].sort();
    const key = `${a}-${b}`;
    if (!edgeSet.has(key)) {
      edgeSet.add(key);
      uniqueEdges.push({ from: a!, to: b! });
    }
  }

  return { nodes, edges: uniqueEdges };
}
