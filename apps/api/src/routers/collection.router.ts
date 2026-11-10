import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_COLLECTION_AMOUNT, NOTIFICATION_RATIO } from '@so/shared';
import { sendCollectionNotifications, sendCollectionClosedTg } from '../services/notification.service.js';
import { isAdmin } from '../admin.js';
import { invalidateGraph } from '../services/graph-cache.service.js';
import { recordOpened } from '../services/notify-routing.service.js';
import { getAskAccess, assertAskAllowed, isSpecialAsker } from '../services/ask-access.service.js';
import { ADMIN_BLOCK_REASONS } from '../config/ask.js';
import { activeObligationTotals, syncCollectionGoal } from '../services/collection-amount.js';
import { settleOpenReviews } from '../services/moderation.service.js';

/** Chat links are shown as buttons: https only, never javascript: or http (SO-14). */
const chatLinkSchema = z.string().max(500).url().refine((u) => /^https:\/\//i.test(u), 'Link must start with https://');

/** What the collection is for: plain text, shown as text only (never HTML). Empty becomes null. */
const descriptionSchema = z.string().trim().max(300);
const toDescription = (value: string | undefined) => (value ? value : null);

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
    .input(z.object({ id: z.string(), reason: z.enum(ADMIN_BLOCK_REASONS) }))
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
      await ctx.db.collection.update({
        where: { id: input.id },
        data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
      });
      // A goal hold must come back if the circle (or an admin) lift was the only reason it stayed paused.
      await syncCollectionGoal(ctx.db, input.id);
      return ctx.db.collection.findUniqueOrThrow({ where: { id: input.id } });
    }),

  /**
   * Author removes a person who joined through this collection's public link.
   * Deletes that connection only. Does not create a reverse pending request
   * and does not change their pledge.
   */
  removeJoiner: protectedProcedure
    .input(z.object({ collectionId: z.string(), userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot remove yourself' });
      }
      const collection = await ctx.db.collection.findUnique({ where: { id: input.collectionId } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const [userAId, userBId] = [ctx.userId, input.userId].sort();
      const connection = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (!connection || connection.viaCollectionId !== input.collectionId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'This person did not join from this collection link' });
      }
      await ctx.db.connection.delete({ where: { id: connection.id } });
      invalidateGraph();
      return { ok: true as const };
    }),

  create: protectedProcedure
    .input(z.object({
      type: z.enum(['EMERGENCY', 'REGULAR']),
      amount: z.number().int().min(MIN_COLLECTION_AMOUNT).nullable().optional(), // whole $ only
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
      chatLink: chatLinkSchema,
      description: descriptionSchema.optional(),
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
          description: toDescription(input.description),
          currentCycleStart: input.type === 'REGULAR' ? new Date() : null,
        },
      });

      // With an amount, special creators (Author/Developer/admin) are announced through the network like
      // everyone else; without one there is no BFS. The special-notify worker additionally tells people
      // who already helped someone about Author/Developer collections.
      if (amountUSD != null) {
        const maxRecipients = Math.ceil(amountUSD / NOTIFICATION_RATIO);
        await sendCollectionNotifications(ctx.db, collection.id, ctx.userId, 'NEW_COLLECTION', 1, maxRecipients);
      }

      return collection;
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await settleOpenReviews(ctx.db, input.id).catch((err) => console.error('[moderation] settle on read', err));
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
      // Opening a collection one was asked to help with, from any entry point (feed, Telegram, push)
      if (collection.creatorId !== ctx.userId) {
        recordOpened(ctx.db, ctx.userId, collection.id).catch((err) => console.error('[notify-stats] open', err));
      }

      // The author has seen the responses: they won't come again in the grouped message (SO-45)
      if (collection.creatorId === ctx.userId) {
        ctx.db.collection.update({ where: { id: collection.id }, data: { creatorViewedAt: new Date() } })
          .catch(() => {});
      }

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

      // Recorded by invite.acceptSos. Older connections stay null and are not guessed.
      const viaLink = new Set<string>();
      if (ctx.userId === collection.creatorId) {
        const links = await ctx.db.connection.findMany({
          where: { viaCollectionId: collection.id },
          select: { userAId: true, userBId: true },
        });
        for (const link of links) {
          const other = link.userAId === collection.creatorId ? link.userBId : link.userAId;
          viaLink.add(other);
        }
      }

      const cycleStart = collection.currentCycleStart?.getTime() ?? 0;
      const totals = await activeObligationTotals(ctx.db, collection.id);
      const currentAmount = totals.amount;
      return {
        ...collection,
        currentAmount,
        creator: {
          ...collection.creator,
          connectionCount: countMap.get(collection.creatorId) || 0,
        },
        obligations: visible.map((o) => ({
          ...o,
          // The received mark is the author's own record; other viewers never get it.
          confirmedAt: ctx.userId === collection.creatorId ? o.confirmedAt : null,
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

  /** Author edits the short description at any time while the collection is open. */
  updateDescription: protectedProcedure
    .input(z.object({ id: z.string(), description: descriptionSchema }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.id } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.status !== 'ACTIVE' && collection.status !== 'BLOCKED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only update active collections' });
      }
      return ctx.db.collection.update({
        where: { id: input.id },
        data: { description: toDescription(input.description) },
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

  /** Collections the viewer created that are already closed or cancelled. */
  myHistory: protectedProcedure.query(async ({ ctx }) => {
    const collections = await ctx.db.collection.findMany({
      where: { creatorId: ctx.userId, status: { in: ['CLOSED', 'CANCELLED'] } },
      include: {
        _count: { select: { obligations: true } },
        obligations: { select: { amount: true } },
      },
      orderBy: { closedAt: 'desc' },
      take: 50,
    });
    return collections.map((col) => ({
      ...col,
      currentAmount: col.obligations.reduce((sum, o) => sum + o.amount, 0),
      obligations: undefined,
    }));
  }),

  // Public endpoint — no auth required, used for SOS landing page
  getPublic: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      await settleOpenReviews(ctx.db, input.id).catch((err) => console.error('[moderation] settle on public read', err));
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.id },
        include: {
          creator: { select: { id: true, name: true, photoUrl: true } },
        },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      const totals = await activeObligationTotals(ctx.db, collection.id);
      return {
        id: collection.id,
        type: collection.type,
        status: collection.status,
        amount: collection.amount,
        currentAmount: totals.amount,
        currency: collection.currency,
        // The author's text is not shown publicly while the collection is paused by moderation
        description: collection.status === 'BLOCKED' && collection.blockReason != null ? null : collection.description,
        createdAt: collection.createdAt,
        closedAt: collection.closedAt,
        suspended: collection.status === 'BLOCKED' && collection.blockReason != null,
        creator: collection.creator,
        _count: { obligations: totals.count },
      };
    }),
});
