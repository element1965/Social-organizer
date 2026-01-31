import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

export const statsRouter = router({
  profile: protectedProcedure
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const targetUserId = input?.userId ?? ctx.userId;

      const [connectionsCount, collectionsCreated, collectionsActive, obligationsGiven, totalAmountPledged] =
        await Promise.all([
          ctx.db.connection.count({
            where: { OR: [{ userAId: targetUserId }, { userBId: targetUserId }] },
          }),
          ctx.db.collection.count({ where: { creatorId: targetUserId } }),
          ctx.db.collection.count({ where: { creatorId: targetUserId, status: 'ACTIVE' } }),
          ctx.db.obligation.count({ where: { userId: targetUserId } }),
          ctx.db.obligation.aggregate({ where: { userId: targetUserId }, _sum: { amount: true } }),
        ]);

      return {
        connectionsCount,
        collectionsCreated,
        collectionsActive,
        obligationsGiven,
        totalAmountPledged: totalAmountPledged._sum.amount ?? 0,
      };
    }),
});
