import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';

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
          // Get obligations with currency for grouping by currency
          ctx.db.obligation.findMany({
            where: { userId: targetUserId },
            select: { amount: true, collection: { select: { currency: true } } },
          }),
        ]);

      // Group amounts by currency (SPEC: "Total amount - separately for each currency")
      const amountByCurrency: Record<string, number> = {};
      for (const obl of obligations) {
        const cur = obl.collection.currency;
        amountByCurrency[cur] = (amountByCurrency[cur] ?? 0) + obl.amount;
      }

      return {
        connectionsCount,
        collectionsCreated,
        collectionsActive,
        obligationsGiven,
        totalAmountPledged: obligations.reduce((sum, o) => sum + o.amount, 0),
        amountByCurrency,
      };
    }),
});
