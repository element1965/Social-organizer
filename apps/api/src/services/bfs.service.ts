import type { PrismaClient } from '@so/db';

export interface BfsRecipient {
  userId: string;
  path: string[];
  depth: number;
  maxConnAt: Date | null;
}

interface Connection {
  userAId: string;
  userBId: string;
  createdAt: Date;
}

/** Build adjacency list from connections array. */
function buildAdjList(connections: Connection[]) {
  const adj = new Map<string, Array<{ neighbor: string; createdAt: Date }>>();
  for (const c of connections) {
    if (!adj.has(c.userAId)) adj.set(c.userAId, []);
    if (!adj.has(c.userBId)) adj.set(c.userBId, []);
    adj.get(c.userAId)!.push({ neighbor: c.userBId, createdAt: c.createdAt });
    adj.get(c.userBId)!.push({ neighbor: c.userAId, createdAt: c.createdAt });
  }
  return adj;
}

/** Load all connections once (lightweight — only IDs + createdAt). */
async function loadAllConnections(db: PrismaClient): Promise<Connection[]> {
  return db.connection.findMany({
    select: { userAId: true, userBId: true, createdAt: true },
  });
}

/**
 * Get all user IDs reachable from startUserId (the connected component).
 * Lightweight BFS in memory — no PostgreSQL temp files.
 */
export async function getNetworkUserIds(db: PrismaClient, startUserId: string): Promise<string[]> {
  const connections = await loadAllConnections(db);
  const adj = new Map<string, string[]>();
  for (const c of connections) {
    if (!adj.has(c.userAId)) adj.set(c.userAId, []);
    if (!adj.has(c.userBId)) adj.set(c.userBId, []);
    adj.get(c.userAId)!.push(c.userBId);
    adj.get(c.userBId)!.push(c.userAId);
  }
  const visited = new Set<string>([startUserId]);
  const queue = [startUserId];
  let qi = 0;
  while (qi < queue.length) {
    for (const neighbor of adj.get(queue[qi++]!) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }
  return [...visited];
}

/**
 * In-memory BFS through connection graph.
 * No PostgreSQL recursive CTEs, no temp files.
 */
export async function findRecipientsViaBfs(
  db: PrismaClient,
  startUserId: string,
  maxDepth: number = 6,
  maxRecipients: number = 10000,
  excludeUserIds: string[] = [],
): Promise<BfsRecipient[]> {
  const connections = await loadAllConnections(db);
  const adj = buildAdjList(connections);
  const excludeSet = new Set(excludeUserIds);

  const visited = new Map<string, { depth: number; path: string[]; maxConnAt: Date }>();
  const queue: Array<{ userId: string; depth: number; path: string[]; maxConnAt: Date }> = [];

  for (const { neighbor, createdAt } of adj.get(startUserId) || []) {
    if (neighbor === startUserId || excludeSet.has(neighbor)) continue;
    if (!visited.has(neighbor)) {
      const entry = { userId: neighbor, depth: 1, path: [startUserId], maxConnAt: createdAt };
      visited.set(neighbor, { depth: 1, path: [startUserId], maxConnAt: createdAt });
      queue.push(entry);
    }
  }

  let qi = 0;
  while (qi < queue.length && visited.size < maxRecipients) {
    const { userId, depth, path, maxConnAt } = queue[qi++]!;
    if (depth >= maxDepth) continue;
    const newPath = [...path, userId];
    for (const { neighbor, createdAt } of adj.get(userId) || []) {
      if (neighbor === startUserId || visited.has(neighbor) || excludeSet.has(neighbor)) continue;
      const newMaxConnAt = createdAt > maxConnAt ? createdAt : maxConnAt;
      visited.set(neighbor, { depth: depth + 1, path: newPath, maxConnAt: newMaxConnAt });
      queue.push({ userId: neighbor, depth: depth + 1, path: newPath, maxConnAt: newMaxConnAt });
    }
  }

  return Array.from(visited.entries()).map(([userId, v]) => ({
    userId,
    path: [...v.path, userId],
    depth: v.depth,
    maxConnAt: v.maxConnAt,
  }));
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

  const connections = await loadAllConnections(db);
  const adj = buildAdjList(connections);

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
