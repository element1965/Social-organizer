import type { PrismaClient } from '@so/db';

export async function getDirectConnectionCounts(db: PrismaClient, userIds: string[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const counts = await db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
    SELECT u.id as user_id, COUNT(c.id)::bigint as count
    FROM users u
    LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
    WHERE u.id = ANY(${userIds})
    GROUP BY u.id
  `;
  return new Map(counts.map((c) => [c.user_id, Number(c.count)]));
}
