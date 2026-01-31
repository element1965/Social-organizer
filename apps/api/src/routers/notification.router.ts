import { z } from 'zod';
import { router, protectedProcedure, paginationInput } from '../trpc';

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

      return { items: notifications, nextCursor };
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
