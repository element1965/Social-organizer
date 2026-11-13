import type { PrismaClient } from '@so/db';
import { getGraph } from './graph-cache.service.js';
import { NETWORK_MAX_DEPTH } from './network.service.js';

export interface BfsRecipient {
  userId: string;
  /** Handshake path from the start user to this person, both included. */
  path: string[];
  depth: number;
  maxConnAt: Date | null;
}

/**
 * One person reached by the walk. The path is rebuilt from the parents only when somebody reads it:
 * a wave over a large network reaches far more people than it finally notifies, and a ready-made
 * array per person was most of the memory of a request.
 */
class BfsNode implements BfsRecipient {
  private built: string[] | null = null;

  constructor(
    readonly userId: string,
    readonly depth: number,
    readonly maxConnAt: Date | null,
    private readonly parent: BfsNode | null,
  ) {}

  get path(): string[] {
    if (!this.built) {
      const out: string[] = new Array(this.depth + 1);
      let node: BfsNode | null = this;
      for (let i = this.depth; node && i >= 0; i--) {
        out[i] = node.userId;
        node = node.parent;
      }
      this.built = out;
    }
    return this.built;
  }
}

/**
 * Get all user IDs reachable from startUserId (the connected component).
 * Lightweight BFS over the cached graph (graph-cache.service).
 */
export async function getNetworkUserIds(db: PrismaClient, startUserId: string): Promise<string[]> {
  const { adj } = await getGraph(db);
  const visited = new Set<string>([startUserId]);
  const queue = [startUserId];
  let qi = 0;
  while (qi < queue.length) {
    for (const { neighbor } of adj.get(queue[qi++]!) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return [...visited];
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
  const { adj, deleted } = await getGraph(db);
  const excludeSet = new Set(excludeUserIds);

  const seen = new Set<string>([startUserId]);
  const recipients: BfsRecipient[] = [];
  const queue: BfsNode[] = [new BfsNode(startUserId, 0, null, null)];

  for (let qi = 0; qi < queue.length && recipients.length < maxRecipients; qi++) {
    const current = queue[qi]!;
    const { depth, maxConnAt } = current;
    if (depth >= maxDepth) continue;
    for (const { neighbor, createdAt } of adj.get(current.userId) || []) {
      if (seen.has(neighbor) || deleted.has(neighbor)) continue;
      seen.add(neighbor);
      const newMaxConnAt = maxConnAt && maxConnAt > createdAt ? maxConnAt : createdAt;
      const node = new BfsNode(neighbor, depth + 1, newMaxConnAt, current);
      queue.push(node);
      if (excludeSet.has(neighbor)) continue;
      recipients.push(node);
      // The cap is exact: one notification per unit of the amount, never more
      if (recipients.length >= maxRecipients) break;
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
  const { adj, deleted } = await getGraph(db);
  const excludeSet = excludeUserIds instanceof Set ? (excludeUserIds as Set<string>) : new Set(excludeUserIds);

  return (function* () {
    const seen = new Set<string>([startUserId]);
    let frontier: BfsNode[] = [new BfsNode(startUserId, 0, null, null)];
    for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
      const next: BfsNode[] = [];
      const ring: BfsNode[] = [];
      for (const current of frontier) {
        const { maxConnAt } = current;
        for (const { neighbor, createdAt } of adj.get(current.userId) || []) {
          if (seen.has(neighbor) || deleted.has(neighbor)) continue;
          seen.add(neighbor);
          const node = new BfsNode(neighbor, depth, maxConnAt && maxConnAt > createdAt ? maxConnAt : createdAt, current);
          next.push(node);
          if (!excludeSet.has(neighbor)) ring.push(node);
        }
      }
      frontier = next;
      if (ring.length > 0) yield ring;
    }
  })();
}

/**
 * BFS for finding shortest path between two users.
 */
export async function findPathBetweenUsers(
  db: PrismaClient,
  fromUserId: string,
  toUserId: string,
  maxDepth: number = 20,
): Promise<Array<{ id: string; name: string; photoUrl: string | null; connectionCount: number; remainingBudget: number | null }>> {
  if (fromUserId === toUserId) {
    const user = await db.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, name: true, photoUrl: true, remainingBudget: true },
    });
    if (!user) return [];
    const countResult = await db.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(c.id)::bigint as count
      FROM connections c
      WHERE c."userAId" = ${fromUserId} OR c."userBId" = ${fromUserId}
    `;
    return [{ ...user, connectionCount: Number(countResult[0]?.count || 0) }];
  }

  const { adj } = await getGraph(db);

  // BFS from fromUserId to toUserId
  const visited = new Map<string, string | null>(); // userId -> parent
  visited.set(fromUserId, null);
  const queue: string[] = [fromUserId];
  let qi = 0;
  let found = false;

  while (qi < queue.length) {
    const current = queue[qi++]!;
    const depth = getPathLength(visited, current, fromUserId);
    if (depth >= maxDepth) continue;

    for (const { neighbor } of adj.get(current) || []) {
      if (visited.has(neighbor)) continue;
      visited.set(neighbor, current);
      if (neighbor === toUserId) { found = true; break; }
      queue.push(neighbor);
    }
    if (found) break;
  }

  if (!found) return [];

  // Reconstruct path
  const fullPath: string[] = [];
  let cur: string | null = toUserId;
  while (cur !== null) {
    fullPath.unshift(cur);
    cur = visited.get(cur) ?? null;
  }

  // Get users and their connection counts
  const [users, connectionCounts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: fullPath } },
      select: { id: true, name: true, photoUrl: true, remainingBudget: true },
    }),
    db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT u.id as user_id, COUNT(c.id)::bigint as count
      FROM users u
      LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
      WHERE u.id = ANY(${fullPath})
      GROUP BY u.id
    `,
  ]);

  const userMap = new Map(users.map(u => [u.id, u]));
  const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

  return fullPath.map(id => {
    const user = userMap.get(id);
    if (!user) return null;
    return { ...user, connectionCount: countMap.get(id) || 0 };
  }).filter(Boolean) as Array<{ id: string; name: string; photoUrl: string | null; connectionCount: number; remainingBudget: number | null }>;
}

function getPathLength(visited: Map<string, string | null>, node: string, root: string): number {
  let len = 0;
  let cur: string | null = node;
  while (cur !== null && cur !== root) {
    len++;
    cur = visited.get(cur) ?? null;
  }
  return len;
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

  const userIdArr = [...userIds];

  const [users, connectionCounts] = await Promise.all([
    db.user.findMany({
      where: { id: { in: userIdArr } },
      select: { id: true, name: true, photoUrl: true, lastSeen: true },
    }),
    db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
      SELECT u.id as user_id, COUNT(c.id)::bigint as count
      FROM users u
      LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
      WHERE u.id = ANY(${userIdArr})
      GROUP BY u.id
    `,
  ]);

  const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

  const nodes = users.map((u) => ({
    id: u.id,
    name: u.name,
    photoUrl: u.photoUrl,
    depth: depthMap.get(u.id) ?? 0,
    connectionCount: countMap.get(u.id) ?? 0,
    lastSeen: u.lastSeen,
  }));

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
