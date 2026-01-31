import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_OBLIGATION_AMOUNT } from '@so/shared';

export const obligationRouter = router({
  create: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      amount: z.number().min(MIN_OBLIGATION_AMOUNT),
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

      const obligation = await ctx.db.obligation.create({
        data: {
          collectionId: input.collectionId,
          userId: ctx.userId,
          amount: input.amount,
          isSubscription: input.isSubscription,
        },
      });

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
    return ctx.db.obligation.findMany({
      where: { userId: ctx.userId },
      include: {
        collection: {
          include: { creator: { select: { id: true, name: true, photoUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
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
