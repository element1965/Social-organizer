import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, paginationInput } from '../trpc.js';
import type { PrismaClient } from '@so/db';
import { dismissRequestEntries, recordOpenedById } from '../services/notify-routing.service.js';
import { VISIBLE_RINGS } from '../services/network.service.js';
import { getPulse } from '../services/pulse.service.js';
import { getDirectConnectionCounts } from '../services/direct-connection-counts.js';
import { chatLinkFor, confirmedRenewals } from '../services/collection-view.js';

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
                select: { amount: true, createdAt: true },
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
      const countMap = await getDirectConnectionCounts(ctx.db, creatorIds);

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
      const needs = [...new Map(notifications.flatMap((n) => (n.collection ? [[n.collection.id, n.collection] as const] : []))).values()];
      const confirmed = await confirmedRenewals(ctx.db, ctx.userId, needs);

      const items = notifications.map((n) => {
        const path = visiblePath(n.handshakePath as string[] | null);
        return {
          ...n,
          handshakePath: path,
          handshakePathResolved: path.map((id) => (id ? { id, name: nameMap.get(id) || id } : { id: '', name: '', hidden: true as const })),
          collection: n.collection
            ? {
                ...n.collection,
                // A notice is no invitation to the participants' chat: the same rule as the Need page (SEC-6).
                // `obligations` here is already the viewer's own active rows.
                chatLink: chatLinkFor(
                  n.collection,
                  ctx.userId,
                  n.collection.obligations[0],
                  confirmed.has(`${n.collection.id}:${n.collection.cycleNumber}`),
                ),
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

  /**
   * Swiping an entry away. A request entry that this call itself moves from open to DISMISSED is counted once
   * for routing (dismissRequestEntries: a conditional update, so a concurrent second call counts nothing); any
   * other entry only changes its status (never over a cycle acknowledgement, RESPONDED).
   */
  dismiss: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.$transaction(async (tx) => {
        await dismissRequestEntries(tx, ctx.userId, { id: input.id });
        await tx.notification.updateMany({
          where: { id: input.id, userId: ctx.userId, status: { not: 'RESPONDED' } },
          data: { status: 'DISMISSED' },
        });
      });
      const row = await ctx.db.notification.findFirst({ where: { id: input.id, userId: ctx.userId } });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      return row;
    }),

  /**
   * "Not for me" on a Need: every open request notice of that Need for this person (the row in the feed, the
   * read ones, older waves) in one transaction, so the decision is recorded whole or not at all. The request
   * entries this call moved are counted once each for routing, as `dismiss` counts them (concurrent calls
   * count each entry once in total); the special-role entries only change their status.
   */
  dismissNeed: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const count = await ctx.db.$transaction(async (tx) => {
        const counted = await dismissRequestEntries(tx, ctx.userId, { collectionId: input.collectionId });
        const special = await tx.notification.updateMany({
          where: {
            userId: ctx.userId,
            collectionId: input.collectionId,
            type: { in: ['SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER'] },
            status: { in: ['UNREAD', 'READ'] },
          },
          data: { status: 'DISMISSED' },
        });
        return counted + special.count;
      });
      return { count };
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
