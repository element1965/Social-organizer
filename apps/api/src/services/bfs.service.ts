import type { PrismaClient } from '@so/db';
import { MAX_BFS_DEPTH, MAX_BFS_RECIPIENTS } from '@so/shared';

export interface BfsRecipient {
  userId: string;
  path: string[];
  depth: number;
}

/**
 * BFS через граф связей с использованием рекурсивного CTE в PostgreSQL.
 * Возвращает список пользователей с кратчайшим путём рукопожатий от startUserId.
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
      -- Уровень 1: прямые связи создателя
      SELECT
        CASE WHEN c."userAId" = $1 THEN c."userBId" ELSE c."userAId" END AS user_id,
        ARRAY[$1] AS path,
        1 AS depth
      FROM connections c
      WHERE c."userAId" = $1 OR c."userBId" = $1

      UNION ALL

      -- Следующие уровни
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
 * Получить срез графа для 3D-визуализации (2-3 уровня).
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
    // Добавляем рёбра из пути
    for (let i = 0; i < r.path.length - 1; i++) {
      edges.push({ from: r.path[i]!, to: r.path[i + 1]! });
    }
  }

  const users = await db.user.findMany({
    where: { id: { in: [...userIds] } },
    select: { id: true, name: true, photoUrl: true },
  });

  // Дедупликация рёбер
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
