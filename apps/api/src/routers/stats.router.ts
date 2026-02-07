import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { findRecipientsViaBfs } from '../services/bfs.service.js';

export const statsRouter = router({
  profile: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetUserId = input?.userId ?? ctx.userId;

      const [connectionsCount, collectionsCreated, collectionsActive, obligationsGiven, obligations] =
        await Promise.all([
          ctx.db.connection.count({
            where: { OR: [{ userAId: targetUserId }, { userBId: targetUserId }] },
          }),
          ctx.db.collection.count({ where: { creatorId: targetUserId } }),
          ctx.db.collection.count({ where: { creatorId: targetUserId, status: 'ACTIVE' } }),
          ctx.db.obligation.count({ where: { userId: targetUserId } }),
          ctx.db.obligation.findMany({
            where: { userId: targetUserId },
            select: { amount: true },
          }),
        ]);

      // All amounts are now in USD, no need for currency grouping
      const totalAmountPledged = obligations.reduce((sum, o) => sum + o.amount, 0);

      return {
        connectionsCount,
        collectionsCreated,
        collectionsActive,
        obligationsGiven,
        totalAmountPledged,
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

  // Platform-wide user growth (all users, from launch day)
  platformGrowth: protectedProcedure.query(async ({ ctx }) => {
    const firstUser = await ctx.db.user.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { createdAt: true },
    });
    const since = firstUser?.createdAt ?? new Date();
    const now = new Date();
    const totalDays = Math.max(1, Math.ceil((now.getTime() - since.getTime()) / (24 * 60 * 60 * 1000)));

    const rows = await ctx.db.$queryRaw<Array<{ day: Date; count: bigint }>>`
      SELECT DATE_TRUNC('day', "createdAt") AS day, COUNT(*)::bigint AS count
      FROM users
      WHERE "deletedAt" IS NULL
      GROUP BY DATE_TRUNC('day', "createdAt")
      ORDER BY day
    `;

    const countByDay = new Map(rows.map(r => [
      new Date(r.day).toISOString().slice(0, 10),
      Number(r.count),
    ]));

    const result: Array<{ date: string; count: number }> = [];
    let cumulative = 0;

    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(since.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      cumulative += countByDay.get(key) ?? 0;
      result.push({ date: key, count: cumulative });
    }

    return result;
  }),

  // Current network capabilities (sum of all remainingBudget in network)
  networkCapabilities: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.userId;

    // Get all users in network up to 3 levels
    const recipients = await findRecipientsViaBfs(ctx.db, userId, 3, 10000, []);
    const networkUserIds = [userId, ...recipients.map(r => r.userId)];

    // Sum remainingBudget for all users with budget > 0
    const result = await ctx.db.user.aggregate({
      where: {
        id: { in: networkUserIds },
        remainingBudget: { gt: 0 },
      },
      _sum: { remainingBudget: true },
      _count: { id: true },
    });

    return {
      total: Math.round(result._sum.remainingBudget || 0),
      contributors: result._count.id,
    };
  }),
});
