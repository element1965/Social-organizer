import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_OBLIGATION_AMOUNT, CURRENCY_CODES } from '@so/shared';
import { convertToUSD } from '../services/currency.service.js';

export const obligationRouter = router({
  create: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      amount: z.number().min(MIN_OBLIGATION_AMOUNT),
      inputCurrency: z.string().refine((c) => CURRENCY_CODES.includes(c), 'Unsupported currency').default('USD'),
      isSubscription: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
      }

      // Convert to USD if needed
      let amountUSD = input.amount;
      if (input.inputCurrency !== 'USD') {
        amountUSD = await convertToUSD(input.amount, input.inputCurrency);
      }

      const obligation = await ctx.db.obligation.create({
        data: {
          collectionId: input.collectionId,
          userId: ctx.userId,
          amount: amountUSD, // Store in USD
          originalAmount: input.amount,
          originalCurrency: input.inputCurrency,
          isSubscription: input.isSubscription,
        },
      });

      // Decrease user's remaining budget if they have one
      const user = await ctx.db.user.findUnique({ where: { id: ctx.userId } });
      if (user?.remainingBudget != null && user.remainingBudget > 0) {
        await ctx.db.user.update({
          where: { id: ctx.userId },
          data: {
            remainingBudget: Math.max(0, user.remainingBudget - amountUSD),
          },
        });
      }

      // Check if collection should be blocked (only if target amount is set)
      if (collection.amount != null) {
        const totalAmount = await ctx.db.obligation.aggregate({
          where: { collectionId: input.collectionId },
          _sum: { amount: true },
        });
        if ((totalAmount._sum.amount ?? 0) >= collection.amount) {
          await ctx.db.collection.update({
            where: { id: input.collectionId },
            data: { status: 'BLOCKED', blockedAt: new Date() },
          });
        }
      }

      return obligation;
    }),

  myList: protectedProcedure.query(async ({ ctx }) => {
    const obligations = await ctx.db.obligation.findMany({
      where: { userId: ctx.userId },
      include: {
        collection: {
          include: { creator: { select: { id: true, name: true, photoUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get connection counts for all creators
    const creatorIds = [...new Set(obligations.map((o) => o.collection.creatorId))];
    const connectionCounts = creatorIds.length > 0
      ? await ctx.db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
          SELECT u.id as user_id, COUNT(c.id)::bigint as count
          FROM users u
          LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
          WHERE u.id = ANY(${creatorIds})
          GROUP BY u.id
        `
      : [];
    const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));

    return obligations.map((o) => ({
      ...o,
      collection: {
        ...o.collection,
        creator: {
          ...o.collection.creator,
          connectionCount: countMap.get(o.collection.creatorId) || 0,
        },
      },
    }));
  }),

  unsubscribe: protectedProcedure
    .input(z.object({ obligationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const obligation = await ctx.db.obligation.findUnique({
        where: { id: input.obligationId },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.userId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!obligation.isSubscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a subscription' });
      }
      return ctx.db.obligation.update({
        where: { id: input.obligationId },
        data: { unsubscribedAt: new Date() },
      });
    }),
});
