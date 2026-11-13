import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, paginationInput } from '../trpc.js';
import type { PrismaClient } from '@so/db';
import { recordDismissed, recordOpenedById } from '../services/notify-routing.service.js';
import { VISIBLE_RINGS } from '../services/network.service.js';
import { getPulse } from '../services/pulse.service.js';

/** Opening or dismissing a notice must not wipe a cycle acknowledgement (RESPONDED). */
async function setNotificationStatus(
  db: PrismaClient,
  userId: string,
  id: string,
  status: 'READ' | 'DISMISSED',
) {
  await db.notification.updateMany({
    where: { id, userId, status: { not: 'RESPONDED' } },
    data: { status },
  });
  const row = await db.notification.findFirst({ where: { id, userId } });
  if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
  return row;
}

export const notificationRouter = router({
  list: protectedProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const notifications = await ctx.db.notification.findMany({
        where: { userId: ctx.userId, status: { in: ['UNREAD', 'READ'] } },
        include: {
          collection: {
            include: {
              creator: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
              // Viewer's own active subscriptions — shown on regular-cycle notifications
              obligations: {
                where: { userId: ctx.userId, unsubscribedAt: null },
                select: { amount: true },
              },
            },
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

      // A stored path runs from the author of the Need to me. People in it further than my visible rings
      // (counted from my end) leave the server only as a place in the chain: no id and no name.
      // The author stays: the Need itself names them.
      const visiblePath = (raw: string[] | null): string[] =>
        (raw ?? []).map((id, index, path) => (index > 0 && path.length - 1 - index > VISIBLE_RINGS ? '' : id));

      // Resolve handshakePath user IDs to names
      const allPathIds = new Set<string>();
      for (const n of notifications) {
        for (const id of visiblePath(n.handshakePath as string[] | null)) if (id) allPathIds.add(id);
      }
      const pathUsers = allPathIds.size > 0
        ? await ctx.db.user.findMany({
            where: { id: { in: [...allPathIds] } },
            select: { id: true, name: true },
          })
        : [];
      const nameMap = new Map(pathUsers.map((u) => [u.id, u.name]));

      const items = notifications.map((n) => {
        const path = visiblePath(n.handshakePath as string[] | null);
        return {
          ...n,
          handshakePath: path,
          handshakePathResolved: path.map((id) => (id ? { id, name: nameMap.get(id) || id } : { id: '', name: '', hidden: true as const })),
          collection: n.collection
            ? {
                ...n.collection,
                creator: {
                  ...n.collection.creator,
                  connectionCount: countMap.get(n.collection.creatorId) || 0,
                },
              }
            : null,
        };
      });

      return { items, nextCursor };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Before the status flips: only the first open of a request counts (notify-routing)
      await recordOpenedById(ctx.db, ctx.userId, input.id).catch((err) => console.error('[notify-stats] open', err));
      return setNotificationStatus(ctx.db, ctx.userId, input.id, 'READ');
    }),

  dismiss: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await recordDismissed(ctx.db, ctx.userId, input.id).catch((err) => console.error('[notify-stats] dismiss', err));
      return setNotificationStatus(ctx.db, ctx.userId, input.id, 'DISMISSED');
    }),

  dismissAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      const result = await ctx.db.notification.updateMany({
        where: { userId: ctx.userId, status: { in: ['UNREAD', 'READ'] } },
        data: { status: 'DISMISSED' },
      });
      return { count: result.count };
    }),

  /**
   * What waits for the person's own decision, for the badges in the navigation:
   * - `needs`: active Needs of others with a notice that has not expired and that they have neither joined nor declined;
   * - `incoming`: connection requests to confirm.
   * Confirmations of their own requests come from `pending.acceptedRecent` ("seen" lives on the device).
   */
  attention: protectedProcedure.query(async ({ ctx }) => {
    const [needRows, incoming] = await Promise.all([
      // One per Need, however many waves reached the person; the same rule as "Waiting for you" in the Circle
      // feed: opened (READ) still waits for a decision, only joining or "Not now" ends it
      ctx.db.notification.findMany({
        where: {
          userId: ctx.userId,
          status: { in: ['UNREAD', 'READ'] },
          type: { in: ['NEW_COLLECTION', 'RE_NOTIFY', 'SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER'] },
          expiresAt: { gt: new Date() },
          collection: {
            status: 'ACTIVE',
            creatorId: { not: ctx.userId },
            obligations: { none: { userId: ctx.userId, unsubscribedAt: null } },
          },
        },
        distinct: ['collectionId'],
        select: { collectionId: true },
      }),
      ctx.db.pendingConnection.count({ where: { toUserId: ctx.userId, status: 'PENDING' } }),
    ]);
    return { needs: needRows.length, incoming };
  }),

  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.notification.count({
      where: { userId: ctx.userId, status: 'UNREAD' },
    });
    return { count };
  }),

  /**
   * "What changed": one light poll for an open app instead of a timer per list. Counters and times only;
   * the client compares each group with the previous answer and re-reads just the lists it stands for
   * (apps/web/src/hooks/usePulse.ts). See services/pulse.service.ts for what each group covers.
   */
  pulse: protectedProcedure.query(({ ctx }) => getPulse(ctx.db, ctx.userId)),
});
