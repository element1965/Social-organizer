import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MAX_CONNECTIONS, GRAPH_SLICE_DEPTH } from '@so/shared';
import { getGraphSlice, findPathBetweenUsers, findRecipientsViaBfs } from '../services/bfs.service.js';

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
      // Check limit for both users (connection is mutual — both use a slot)
      const [myCount, targetCount] = await Promise.all([
        ctx.db.connection.count({
          where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
        }),
        ctx.db.connection.count({
          where: { OR: [{ userAId: input.userId }, { userBId: input.userId }] },
        }),
      ]);
      if (myCount >= MAX_CONNECTIONS) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Connection limit reached (${MAX_CONNECTIONS})` });
      }
      if (targetCount >= MAX_CONNECTIONS) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Target user has reached connection limit' });
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

  findPath: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const path = await findPathBetweenUsers(ctx.db, ctx.userId, input.targetUserId);
      return { path };
    }),

  getNetworkStats: protectedProcedure.query(async ({ ctx }) => {
    const recipients = await findRecipientsViaBfs(ctx.db, ctx.userId, 6, 10000, []);
    const byDepth: Record<number, number> = {};
    for (const r of recipients) {
      byDepth[r.depth] = (byDepth[r.depth] || 0) + 1;
    }
    return {
      totalReachable: recipients.length,
      byDepth,
    };
  }),
});
