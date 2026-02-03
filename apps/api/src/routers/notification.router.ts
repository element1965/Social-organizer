import { z } from 'zod';
import { router, protectedProcedure, paginationInput } from '../trpc.js';

export const notificationRouter = router({
  list: protectedProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.db.notification.findMany({
        where: { userId: ctx.userId },
        include: {
          collection: {
            include: { creator: { select: { id: true, name: true, photoUrl: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined;
      if (notifications.length > input.limit) {
        const next = notifications.pop();
        nextCursor = next?.id;
      }

      // Get connection counts for all creators
      const creatorIds = [...new Set(notifications.map((n) => n.collection?.creatorId).filter(Boolean))] as string[];
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

      const items = notifications.map((n) => ({
        ...n,
        collection: n.collection
          ? {
              ...n.collection,
              creator: {
                ...n.collection.creator,
                connectionCount: countMap.get(n.collection.creatorId) || 0,
              },
            }
          : null,
      }));

      return { items, nextCursor };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.update({
        where: { id: input.id, userId: ctx.userId },
        data: { status: 'READ' },
      });
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.notification.update({
        where: { id: input.id, userId: ctx.userId },
        data: { status: 'DISMISSED' },
      });
    }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.notification.count({
      where: { userId: ctx.userId, status: 'UNREAD' },
    });
    return { count };
  }),
});
