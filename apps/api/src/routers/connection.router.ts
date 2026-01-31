import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { MAX_CONNECTIONS, GRAPH_SLICE_DEPTH } from '@so/shared';
import { getGraphSlice } from '../services/bfs.service';

export const connectionRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const connections = await ctx.db.connection.findMany({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      include: {
        userA: { select: { id: true, name: true, photoUrl: true } },
        userB: { select: { id: true, name: true, photoUrl: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return connections.map((c) => {
      const other = c.userAId === ctx.userId ? c.userB : c.userA;
      return {
        id: c.id, userId: other.id, name: other.name,
        photoUrl: other.photoUrl, createdAt: c.createdAt,
      };
    });
  }),

  add: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself' });
      }
      const count = await ctx.db.connection.count({
        where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      });
      if (count >= MAX_CONNECTIONS) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Connection limit reached (${MAX_CONNECTIONS})` });
      }
      const [userAId, userBId] = [ctx.userId, input.userId].sort();
      const existing = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existing) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Already connected' });
      }
      return ctx.db.connection.create({ data: { userAId: userAId!, userBId: userBId! } });
    }),

  getCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.connection.count({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
    });
    return { count, max: MAX_CONNECTIONS };
  }),

  graphSlice: protectedProcedure
    .input(z.object({ depth: z.number().min(1).max(3).default(GRAPH_SLICE_DEPTH) }).optional())
    .query(async ({ ctx, input }) => {
      return getGraphSlice(ctx.db, ctx.userId, input?.depth ?? GRAPH_SLICE_DEPTH);
    }),
});
