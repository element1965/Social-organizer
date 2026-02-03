import type { PrismaClient } from '@so/db';
import { MAX_BFS_DEPTH, MAX_BFS_RECIPIENTS } from '@so/shared';

export interface BfsRecipient {
  userId: string;
  path: string[];
  depth: number;
}

/**
 * BFS through connection graph using recursive CTE in PostgreSQL.
 * Returns list of users with shortest handshake path from startUserId.
 */
export async function findRecipientsViaBfs(
  db: PrismaClient,
  startUserId: string,
  maxDepth: number = MAX_BFS_DEPTH,
  maxRecipients: number = MAX_BFS_RECIPIENTS,
  excludeUserIds: string[] = [],
): Promise<BfsRecipient[]> {
  const excludeList = excludeUserIds.length > 0
    ? excludeUserIds.map((id) => `'${id}'`).join(',')
    : `'__none__'`;

  const result = await db.$queryRawUnsafe<Array<{
    user_id: string;
    path: string[];
    depth: number;
  }>>(`
    WITH RECURSIVE bfs AS (
      -- Level 1: creator's direct connections
      SELECT
        CASE WHEN c."userAId" = $1 THEN c."userBId" ELSE c."userAId" END AS user_id,
        ARRAY[$1] AS path,
        1 AS depth
      FROM connections c
      WHERE c."userAId" = $1 OR c."userBId" = $1

      UNION ALL

      -- Next levels
      SELECT
        CASE WHEN c."userAId" = b.user_id THEN c."userBId" ELSE c."userAId" END AS user_id,
        b.path || b.user_id,
        b.depth + 1
      FROM connections c
      JOIN bfs b ON (c."userAId" = b.user_id OR c."userBId" = b.user_id)
      WHERE b.depth < $2
        AND NOT (CASE WHEN c."userAId" = b.user_id THEN c."userBId" ELSE c."userAId" END = ANY(b.path))
    )
    SELECT DISTINCT ON (b.user_id) b.user_id, b.path, b.depth
    FROM bfs b
    JOIN users u ON u.id = b.user_id
    WHERE b.user_id != $1
      AND b.user_id NOT IN (${excludeList})
      AND u."deletedAt" IS NULL
    ORDER BY b.user_id, b.depth
    LIMIT $3
  `, startUserId, maxDepth, maxRecipients);

  return result.map((r) => ({
    userId: r.user_id,
    path: [...r.path, r.user_id],
    depth: r.depth,
  }));
}

/**
 * BFS for finding shortest path between two users.
 * Returns array of users from fromUserId to toUserId inclusive.
 */
export async function findPathBetweenUsers(
  db: PrismaClient,
  fromUserId: string,
  toUserId: string,
  maxDepth: number = MAX_BFS_DEPTH,
): Promise<Array<{ id: string; name: string; photoUrl: string | null }>> {
  if (fromUserId === toUserId) {
    const user = await db.user.findUnique({
      where: { id: fromUserId },
      select: { id: true, name: true, photoUrl: true },
    });
    return user ? [user] : [];
  }

  const result = await db.$queryRawUnsafe<Array<{
    user_id: string;
    path: string[];
    depth: number;
  }>>(`
    WITH RECURSIVE bfs AS (
      SELECT
        CASE WHEN c."userAId" = $1 THEN c."userBId" ELSE c."userAId" END AS user_id,
        ARRAY[$1] AS path,
        1 AS depth
      FROM connections c
      WHERE c."userAId" = $1 OR c."userBId" = $1

      UNION ALL

      SELECT
        CASE WHEN c."userAId" = b.user_id THEN c."userBId" ELSE c."userAId" END AS user_id,
        b.path || b.user_id,
        b.depth + 1
      FROM connections c
      JOIN bfs b ON (c."userAId" = b.user_id OR c."userBId" = b.user_id)
      WHERE b.depth < $3
        AND NOT (CASE WHEN c."userAId" = b.user_id THEN c."userBId" ELSE c."userAId" END = ANY(b.path))
    )
    SELECT b.user_id, b.path, b.depth
    FROM bfs b
    WHERE b.user_id = $2
    ORDER BY b.depth
    LIMIT 1
  `, fromUserId, toUserId, maxDepth);

  if (result.length === 0) {
    return [];
  }

  const { path } = result[0]!;
  const fullPath = [...path, toUserId];

  const users = await db.user.findMany({
    where: { id: { in: fullPath } },
    select: { id: true, name: true, photoUrl: true },
  });

  const userMap = new Map(users.map(u => [u.id, u]));
  return fullPath.map(id => userMap.get(id)!).filter(Boolean);
}

/**
 * Get graph slice for 3D visualization (2-3 levels).
 */
export async function getGraphSlice(
  db: PrismaClient,
  userId: string,
  depth: number = 3,
): Promise<{ nodes: Array<{ id: string; name: string; photoUrl: string | null }>; edges: Array<{ from: string; to: string }> }> {
  const recipients = await findRecipientsViaBfs(db, userId, depth, 500, []);

  const userIds = new Set<string>([userId]);
  const edges: Array<{ from: string; to: string }> = [];

  for (const r of recipients) {
    userIds.add(r.userId);
    // Add edges from path
    for (let i = 0; i < r.path.length - 1; i++) {
      edges.push({ from: r.path[i]!, to: r.path[i + 1]! });
    }
  }

  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, photoUrl: true },
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

  return { nodes: users, edges: uniqueEdges };
}
