import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';


export const statsRouter = router({
  profile: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetUserId = input?.userId ?? ctx.userId;

      const [connectionsCount, collectionsCreated, collectionsActive, obligationsGiven, obligationsReceived] =
        await Promise.all([
          ctx.db.connection.count({
            where: { OR: [{ userAId: targetUserId }, { userBId: targetUserId }] },
          }),
          ctx.db.collection.count({ where: { creatorId: targetUserId } }),
          ctx.db.collection.count({ where: { creatorId: targetUserId, status: 'ACTIVE' } }),
          ctx.db.obligation.count({ where: { userId: targetUserId } }),
          ctx.db.obligation.count({ where: { collection: { creatorId: targetUserId } } }),
        ]);

      return {
        connectionsCount,
        collectionsCreated,
        collectionsActive,
        obligationsGiven,
        obligationsReceived,
      };
    }),

  // Help statistics for dashboard
  help: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Get obligations given (user helped others)
    const obligationsGiven = await ctx.db.obligation.findMany({
      where: { userId },
      select: { amount: true },
    });

    // Get obligations received (others helped user's collections)
    const collectionsWithObligations = await ctx.db.collection.findMany({
      where: { creatorId: userId },
      include: {
        obligations: {
          select: { amount: true },
        },
      },
    });

    const givenCount = obligationsGiven.length;
    const givenTotal = obligationsGiven.reduce((sum, o) => sum + o.amount, 0);

    const receivedCount = collectionsWithObligations.reduce(
      (sum, c) => sum + c.obligations.length,
      0
    );
    const receivedTotal = collectionsWithObligations.reduce(
      (sum, c) => sum + c.obligations.reduce((s, o) => s + o.amount, 0),
      0
    );

    // Active intentions count (obligations in active collections)
    const activeIntentions = await ctx.db.obligation.count({
      where: {
        userId,
        collection: { status: 'ACTIVE' },
      },
    });

    // Completed collections count
    const completedCollections = await ctx.db.collection.count({
      where: {
        creatorId: userId,
        status: 'CLOSED',
      },
    });

    // Network reach (from connections)
    const networkReach = await ctx.db.connection.count({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
    });

    return {
      given: {
        count: givenCount,
        totalAmount: Math.round(givenTotal),
      },
      received: {
        count: receivedCount,
        totalAmount: Math.round(receivedTotal),
      },
      activeIntentions,
      completedCollections,
      networkReach,
    };
  }),

  // Help given statistics: allTime + per-month breakdown
  helpGivenByPeriod: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    const allObligations = await ctx.db.obligation.findMany({
      where: { userId },
      select: { amount: true, createdAt: true },
    });

    const allTime = {
      count: allObligations.length,
      amount: Math.round(allObligations.reduce((sum, o) => sum + o.amount, 0)),
    };

    // Group by month (YYYY-MM)
    const byMonth: Record<string, { count: number; amount: number }> = {};
    for (const o of allObligations) {
      const d = new Date(o.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!byMonth[key]) byMonth[key] = { count: 0, amount: 0 };
      byMonth[key].count++;
      byMonth[key].amount += o.amount;
    }

    // Sort months chronologically and round amounts
    const months = Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({ month, count: data.count, amount: Math.round(data.amount) }));

    return { allTime, months };
  }),

  // Platform-wide new user growth with adaptive grouping:
  // ≤14 days → daily, ≤14 weeks → weekly, otherwise → monthly
  // Returns delta (new users per period), not cumulative
  platformGrowth: protectedProcedure.query(async ({ ctx }) => {
    const firstUser = await ctx.db.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const since = firstUser?.createdAt ?? new Date();
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)));

    const period: 'day' | 'week' | 'month' =
      totalDays <= 14 ? 'day' : totalDays <= 98 ? 'week' : 'month';

    const rows = await ctx.db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM users
      WHERE "deletedAt" IS NULL
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY day
    `;

    // Daily new users map
    const countByDay = new Map(rows.map(r => [
      new Date(r.day).toISOString().slice(0, 10),
      Number(r.count),
    ]));

    if (period === 'day') {
      const points: Array<{ date: string; count: number }> = [];
      for (let i = 0; i <= totalDays; i++) {
        const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
        const key = d.toISOString().slice(0, 10);
        points.push({ date: key, count: countByDay.get(key) ?? 0 });
      }
      return { period, points };
    }

    // Group by week or month — sum new users per bucket
    const bucketKey = (dateStr: string): string => {
      const d = new Date(dateStr);
      if (period === 'week') {
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        const monday = new Date(d.getFullYear(), d.getMonth(), diff);
        return monday.toISOString().slice(0, 10);
      }
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };

    const buckets = new Map<string, number>();
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const dateStr = d.toISOString().slice(0, 10);
      const key = bucketKey(dateStr);
      buckets.set(key, (buckets.get(key) ?? 0) + (countByDay.get(dateStr) ?? 0));
    }

    const points = Array.from(buckets.entries()).map(([date, count]) => ({ date, count }));
    return { period, points };
  }),

  // Current network capabilities (sum of all remainingBudget in the connected cluster)
  networkCapabilities: protectedProcedure.query(async ({ ctx }) => {
    // If user has no connections, fallback to inviter's network (pending connection)
    let userId = ctx.userId;
    const hasConn = await ctx.db.connection.findFirst({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      select: { id: true },
    });
    if (!hasConn) {
      const pending = await ctx.db.pendingConnection.findFirst({
        where: { fromUserId: ctx.userId, status: 'PENDING' },
        select: { toUserId: true },
        orderBy: { createdAt: 'desc' },
      });
      if (pending) userId = pending.toUserId;
    }

    // Find the entire connected cluster via recursive CTE (no depth limit)
    const result = await ctx.db.$queryRaw<Array<{ total: number; contributors: bigint }>>`
      WITH RECURSIVE cluster AS (
        SELECT ${userId}::text AS user_id
        UNION
        SELECT CASE WHEN c."userAId" = cluster.user_id THEN c."userBId" ELSE c."userAId" END
        FROM connections c
        JOIN cluster ON c."userAId" = cluster.user_id OR c."userBId" = cluster.user_id
      )
      SELECT
        COALESCE(SUM(u."remainingBudget"), 0)::float AS total,
        COUNT(*)::bigint AS contributors
      FROM users u
      JOIN cluster ON u.id = cluster.user_id
      WHERE u."remainingBudget" > 0 AND u."deletedAt" IS NULL
    `;

    return {
      total: Math.round(result[0]?.total || 0),
      contributors: Number(result[0]?.contributors || 0),
    };
  }),
});
