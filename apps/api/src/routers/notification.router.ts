import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, paginationInput } from '../trpc.js';
import { dismissNeedRequests, dismissRequestEntries, NEED_REQUEST_TYPES, recordOpened } from '../services/notify-routing.service.js';
import { VISIBLE_RINGS } from '../services/network.service.js';
import { getPulse } from '../services/pulse.service.js';
import { getDirectConnectionCounts } from '../services/direct-connection-counts.js';
import { chatLinkFor, confirmedRenewals } from '../services/collection-view.js';
import { waitingNeedRequests, waitingNeedRenewals } from '../services/need-attention.js';

export const notificationRouter = router({
  list: protectedProcedure
    .input(paginationInput.extend({ includeWaiting: z.boolean().optional() }))
    .query(async ({ ctx, input }) => {
      const include = {
        collection: {
          include: {
            creator: { select: { id: true, name: true, photoUrl: true, remainingBudget: true } },
            // Viewer's own active subscriptions, shown on regular-cycle notifications.
            obligations: {
              where: { userId: ctx.userId, unsubscribedAt: null },
              select: { amount: true, createdAt: true },
            },
          },
        },
      } as const;
      const notifications = await ctx.db.notification.findMany({
        where: { userId: ctx.userId, status: { in: ['UNREAD', 'READ'] } },
        include,
        orderBy: { createdAt: 'desc' },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
      });

      let nextCursor: string | undefined;
      if (notifications.length > input.limit) {
        const next = notifications.pop();
        nextCursor = next?.id;
      }
      // One representative per undecided Need, independently of the activity page. The last expiry
      // keeps the row visible for as long as any request wave still waits.
      const [waiting, renewals] = input.includeWaiting && !input.cursor
        ? await Promise.all([
            ctx.db.notification.findMany({
              where: waitingNeedRequests(ctx.userId, new Date()),
              distinct: ['collectionId'],
              include,
              orderBy: [{ expiresAt: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
            }),
            waitingNeedRenewals(ctx.db, ctx.userId),
          ])
        : [[], []];
      const allNotices = [...notifications, ...waiting];
      const creatorIds = [...new Set(allNotices.map((n) => n.collection.creatorId))];
      const countMap = await getDirectConnectionCounts(ctx.db, creatorIds);

      // A stored path runs from the author of the Need to me. People in it further than my visible rings
      // (counted from my end) leave the server only as a place in the chain: no id and no name.
      // The author stays: the Need itself names them.
      const visiblePath = (raw: string[] | null): string[] =>
        (raw ?? []).map((id, index, path) => (index > 0 && path.length - 1 - index > VISIBLE_RINGS ? '' : id));

      // Resolve handshakePath user IDs to names
      const allPathIds = new Set<string>();
      for (const n of allNotices) {
        for (const id of visiblePath(n.handshakePath as string[] | null)) if (id) allPathIds.add(id);
      }
      const pathUsers = allPathIds.size > 0
        ? await ctx.db.user.findMany({
            where: { id: { in: [...allPathIds] } },
            select: { id: true, name: true },
          })
        : [];
      const nameMap = new Map(pathUsers.map((u) => [u.id, u.name]));
      const needs = [...new Map(allNotices.flatMap((n) => (n.collection ? [[n.collection.id, n.collection] as const] : []))).values()];
      const confirmed = await confirmedRenewals(ctx.db, ctx.userId, needs);

      const view = (n: (typeof allNotices)[number]) => {
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
      };

      return {
        items: notifications.map(view),
        nextCursor,
        waiting: waiting.map(view),
        waitingRenewals: renewals,
      };
    }),

  markRead: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { db, userId } = ctx;
      const row = await db.notification.findFirst({ where: { id: input.id, userId } });
      if (!row) throw new TRPCError({ code: 'NOT_FOUND' });
      if (NEED_REQUEST_TYPES.some((type) => type === row.type)) {
        await recordOpened(db, userId, row.collectionId);
      } else if (row.status === 'UNREAD') {
        await db.notification.updateMany({
          where: { id: row.id, userId, status: 'UNREAD' },
          data: { status: 'READ' },
        });
      } else {
        return row;
      }
      return db.notification.findFirstOrThrow({ where: { id: row.id, userId } });
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
      const count = await ctx.db.$transaction((tx) => dismissNeedRequests(tx, ctx.userId, input.collectionId));
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

  /** Same count for the Circle tab badge and the "Waiting for you" section. */
  attention: protectedProcedure.query(async ({ ctx }) => {
    const [needRows, renewals, incoming] = await Promise.all([
      // One per Need, however many waves reached the person; the same rule as "Waiting for you" in the Circle
      // feed: opened (READ) still waits for a decision, only joining or "Not now" ends it
      ctx.db.notification.findMany({
        where: waitingNeedRequests(ctx.userId, new Date()),
        distinct: ['collectionId'],
        select: { collectionId: true },
      }),
      waitingNeedRenewals(ctx.db, ctx.userId),
      ctx.db.pendingConnection.count({ where: { toUserId: ctx.userId, status: 'PENDING' } }),
    ]);
    return { needs: needRows.length + renewals.length, incoming };
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
