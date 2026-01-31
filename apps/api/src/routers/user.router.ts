import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: {
        platformAccounts: { select: { platform: true, platformId: true } },
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return user;
  }),

  update: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      bio: z.string().max(500).optional(),
      phone: z.string().max(20).optional(),
      photoUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: input });
    }),

  getById: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId, deletedAt: null },
        select: {
          id: true, name: true, bio: true, phone: true,
          photoUrl: true, role: true, createdAt: true,
        },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      return user;
    }),

  getStats: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [connectionsCount, collectionsCount, obligationsCount] = await Promise.all([
        ctx.db.connection.count({
          where: { OR: [{ userAId: input.userId }, { userBId: input.userId }] },
        }),
        ctx.db.collection.count({ where: { creatorId: input.userId } }),
        ctx.db.obligation.count({ where: { userId: input.userId } }),
      ]);
      return { connectionsCount, collectionsCount, obligationsCount };
    }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.userId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }),
});
