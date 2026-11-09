import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_COLLECTION_AMOUNT, NOTIFICATION_RATIO } from '@so/shared';
import { sendCollectionNotifications, sendCollectionClosedTg } from '../services/notification.service.js';
import { isAdmin } from '../admin.js';
import { getAskAccess, assertAskAllowed, isSpecialAsker } from '../services/ask-access.service.js';
import { BLOCK_REASONS } from '../config/ask.js';

/** Chat links are shown as buttons: https only, never javascript: or http (SO-14). */
const chatLinkSchema = z.string().max(500).url().refine((u) => /^https:\/\//i.test(u), 'Link must start with https://');

function assertAdmin(userId: string) {
  if (!isAdmin(userId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can block collections' });
}

export const collectionRouter = router({
  /** Whether the user may create a request, with the numbers the "path to request" card renders. */
  askAccess: protectedProcedure.query(async ({ ctx }) => {
    const access = await getAskAccess(ctx.db, ctx.userId);
    const special = await isSpecialAsker(ctx.db, ctx.userId);
    return special ? { ...access, allowed: true } : access;
  }),

  /** Admin-only: suspend a collection with a reason. Participants see it as paused. */
  block: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.enum(BLOCK_REASONS) }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId);
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only active collections can be blocked' });
      }
      const blocked = await ctx.db.collection.update({
        where: { id: input.id },
        data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: input.reason },
      });
      // Stop the request from circulating: pending "new request" notifications are no longer actionable
      await ctx.db.notification.updateMany({
        where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: { in: ['UNREAD', 'READ'] } },
        data: { status: 'EXPIRED' },
      });
      return blocked;
    }),

  /** Admin-only: lift an admin block. */
  unblock: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId);
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.status !== 'BLOCKED' || collection.blockReason == null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not blocked by an admin' });
      }
      return ctx.db.collection.update({
        where: { id: input.id },
        data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
      });
    }),

  create: protectedProcedure
    .input(z.object({
      type: z.enum(['EMERGENCY', 'REGULAR']),
      amount: z.number().int().min(MIN_COLLECTION_AMOUNT).nullable().optional(), // whole $ only
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
      chatLink: chatLinkSchema,
    }))
    .mutation(async ({ ctx, input }) => {
      // Check creator role
      const creator = await ctx.db.user.findUnique({
        where: { id: ctx.userId },
        select: { role: true },
      });
      if (!creator) throw new TRPCError({ code: 'NOT_FOUND', message: 'User not found' });

      const isSpecial = creator.role === 'AUTHOR' || creator.role === 'DEVELOPER' || isAdmin(ctx.userId);

      // Regular users must specify amount
      if (!isSpecial && (input.amount == null || input.amount < MIN_COLLECTION_AMOUNT)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Amount must be at least ${MIN_COLLECTION_AMOUNT}` });
      }

      // Path to a request: enough direct connections and a big enough network. The amount is not capped.
      if (!isSpecial) {
        assertAskAllowed(await getAskAccess(ctx.db, ctx.userId, { quick: true }));
      }

      // Limit: max 1 emergency + 1 regular at the same time
      const existingActive = await ctx.db.collection.count({
        where: {
          creatorId: ctx.userId,
          type: input.type,
          status: { in: ['ACTIVE', 'BLOCKED'] },
        },
      });
      if (existingActive > 0) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `You already have an active ${input.type.toLowerCase()} collection`,
        });
      }

      const amountUSD = input.amount;

      const collection = await ctx.db.collection.create({
        data: {
          creatorId: ctx.userId,
          type: input.type,
          amount: amountUSD,
          currency: 'USD',
          chatLink: input.chatLink,
          currentCycleStart: input.type === 'REGULAR' ? new Date() : null,
        },
      });

      // BFS distribution NOT sent for special profiles (Author/Developer)
      // Their notifications come through special-notify worker after first intention
      if (!isSpecial && amountUSD != null) {
        const maxRecipients = Math.ceil(amountUSD / NOTIFICATION_RATIO);
        await sendCollectionNotifications(ctx.db, collection.id, ctx.userId, 'NEW_COLLECTION', 1, maxRecipients);
      }

      return collection;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, name: true, photoUrl: true } },
          obligations: {
            include: { user: { select: { id: true, name: true, photoUrl: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });

      // Get connection counts for all participants and creator
      const userIds = [collection.creatorId, ...collection.obligations.map((o) => o.userId)];
      const connectionCounts = await ctx.db.$queryRaw<Array<{ user_id: string; count: bigint }>>`
        SELECT u.id as user_id, COUNT(c.id)::bigint as count
        FROM users u
        LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
        WHERE u.id = ANY(${userIds})
        GROUP BY u.id
      `;
      const countMap = new Map(connectionCounts.map((c) => [c.user_id, Number(c.count)]));
      const visible = collection.obligations.filter((o) => o.unsubscribedAt == null);
      const renewal = collection.type === 'REGULAR' && collection.cycleNumber > 1 && collection.currentCycleStart != null;
      const acked = new Set<string>();
      if (renewal) {
        const rows = await ctx.db.notification.findMany({
          where: {
            collectionId: collection.id,
            type: 'CYCLE_RENEWED',
            wave: collection.cycleNumber,
            status: 'RESPONDED',
          },
          select: { userId: true },
        });
        for (const row of rows) acked.add(row.userId);
      }

      // A direct connection created with (or after) the collection is treated as a public-link join.
      // There is no source column on Connection. Friends from before the collection are left alone.
      const viaLink = new Set<string>();
      if (ctx.userId === collection.creatorId && visible.length > 0) {
        const pairs = visible.map((o) => {
          const [userAId, userBId] = [collection.creatorId, o.userId].sort();
          return { userAId: userAId!, userBId: userBId! };
        });
        const links = await ctx.db.connection.findMany({
          where: { OR: pairs },
          select: { userAId: true, userBId: true, createdAt: true },
        });
        const started = collection.createdAt.getTime() - 60_000;
        for (const link of links) {
          if (link.createdAt.getTime() < started) continue;
          const other = link.userAId === collection.creatorId ? link.userBId : link.userAId;
          viaLink.add(other);
        }
      }

      const cycleStart = collection.currentCycleStart?.getTime() ?? 0;
      const currentAmount = visible.reduce((sum, o) => sum + o.amount, 0);
      return {
        ...collection,
        currentAmount,
        creator: {
          ...collection.creator,
          connectionCount: countMap.get(collection.creatorId) || 0,
        },
        obligations: visible.map((o) => ({
          ...o,
          user: {
            ...o.user,
            connectionCount: countMap.get(o.userId) || 0,
          },
          /** null outside a renewal cycle; false until the person confirms the new cycle. */
          cycleConfirmed: renewal ? o.createdAt.getTime() >= cycleStart || acked.has(o.userId) : null,
          joinedViaLink: viaLink.has(o.userId),
        })),
      };
    }),

  updateAmount: protectedProcedure
    .input(z.object({
      id: z.string(),
      amount: z.number().int().min(MIN_COLLECTION_AMOUNT).nullable(), // whole $ only
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only update active collections' });
      }
      if (collection.blockReason != null) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'COLLECTION_BLOCKED: This collection is suspended by an administrator' });
      }

      const amountUSD = input.amount;

      const updated = await ctx.db.collection.update({
        where: { id: input.id },
        data: {
          amount: amountUSD,
          originalAmount: null, // clear goals typed in other currencies before SO-40
          originalCurrency: null,
        },
      });

      // If new goal is larger — notify additional recipients for the difference
      const oldAmount = collection.amount;
      if (amountUSD != null && (oldAmount == null || amountUSD > oldAmount)) {
        const oldMax = oldAmount != null ? Math.ceil(oldAmount / NOTIFICATION_RATIO) : 0;
        const newMax = Math.ceil(amountUSD / NOTIFICATION_RATIO);
        const extra = newMax - oldMax;
        if (extra > 0) {
          sendCollectionNotifications(ctx.db, collection.id, ctx.userId, 'RE_NOTIFY', 1, extra)
            .catch((err) => console.error('[updateAmount] notification error:', err));
        }
      }

      return updated;
    }),

  updateChatLink: protectedProcedure
    .input(z.object({ id: z.string(), chatLink: chatLinkSchema }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      return ctx.db.collection.update({
        where: { id: input.id },
        data: { chatLink: input.chatLink },
      });
    }),

  close: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection not active' });
      }
      const updated = await ctx.db.collection.update({
        where: { id: input.id },
        data: { status: 'CLOSED', closedAt: new Date() },
      });

      // Mark all NEW_COLLECTION and RE_NOTIFY notifications as read so they disappear from dashboards
      await ctx.db.notification.updateMany({
        where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: 'UNREAD' },
        data: { status: 'READ' },
      });

      // Send COLLECTION_CLOSED to all previously notified
      const notifiedUsers = await ctx.db.notification.findMany({
        where: { collectionId: input.id },
        select: { userId: true },
        distinct: ['userId'],
      });
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      for (const { userId } of notifiedUsers) {
        try {
          await ctx.db.notification.upsert({
            where: { userId_collectionId_type_wave: { userId, collectionId: input.id, type: 'COLLECTION_CLOSED', wave: 0 } },
            create: { userId, collectionId: input.id, type: 'COLLECTION_CLOSED', handshakePath: [], expiresAt, wave: 0 },
            update: { type: 'COLLECTION_CLOSED', status: 'UNREAD', expiresAt },
          });
        } catch { /* skip */ }
      }

      // Send Telegram notification about closure
      sendCollectionClosedTg(ctx.db, input.id, ctx.userId).catch((err) =>
        console.error('[TG Closed] Failed:', err),
      );

      return updated;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only cancel active collections' });
      }
      // Mark all NEW_COLLECTION and RE_NOTIFY notifications as read
      await ctx.db.notification.updateMany({
        where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: 'UNREAD' },
        data: { status: 'READ' },
      });
      return ctx.db.collection.update({
        where: { id: input.id }, data: { status: 'CANCELLED' },
      });
    }),

  myActive: protectedProcedure.query(async ({ ctx }) => {
    const collections = await ctx.db.collection.findMany({
      where: { creatorId: ctx.userId, status: { in: ['ACTIVE', 'BLOCKED'] } },
      include: {
        _count: { select: { obligations: true } },
        obligations: { select: { amount: true, unsubscribedAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return collections.map((col) => {
      const active = col.obligations.filter((o) => o.unsubscribedAt == null);
      return {
        ...col,
        currentAmount: active.reduce((sum, o) => sum + o.amount, 0),
        participantCount: active.length,
        obligations: undefined,
      };
    });
  }),

  myParticipating: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.obligation.findMany({
      where: { userId: ctx.userId, unsubscribedAt: null },
      include: {
        collection: {
          include: {
            creator: { select: { id: true, name: true, photoUrl: true } },
            obligations: { select: { amount: true, unsubscribedAt: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => {
      const { obligations, ...collection } = row.collection;
      const active = obligations.filter((o) => o.unsubscribedAt == null);
      return {
        ...row,
        collection: {
          ...collection,
          currentAmount: active.reduce((sum, o) => sum + o.amount, 0),
          participantCount: active.length,
        },
      };
    });
  }),

  // Public endpoint — no auth required, used for SOS landing page
  getPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, name: true, photoUrl: true } },
          obligations: { select: { amount: true, unsubscribedAt: true } },
        },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      const active = collection.obligations.filter((o) => o.unsubscribedAt == null);
      const currentAmount = active.reduce((sum, o) => sum + o.amount, 0);
      return {
        id: collection.id,
        type: collection.type,
        status: collection.status,
        amount: collection.amount,
        currentAmount,
        currency: collection.currency,
        createdAt: collection.createdAt,
        closedAt: collection.closedAt,
        blockReason: collection.blockReason,
        creator: collection.creator,
        _count: { obligations: active.length },
      };
    }),
});
