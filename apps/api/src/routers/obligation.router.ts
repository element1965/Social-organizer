import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_OBLIGATION_AMOUNT, NOTIFICATION_TTL_HOURS, REGULAR_CYCLE_DAYS } from '@so/shared';
import { sendGoalReachedToCreator } from '../services/notification.service.js';

export const obligationRouter = router({
  create: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      amount: z.number().int().min(MIN_OBLIGATION_AMOUNT), // whole $ only: 1 $ = 1 unit
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
      isSubscription: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
      }

      const amountUSD = input.amount;

      const obligation = await ctx.db.obligation.create({
        data: {
          collectionId: input.collectionId,
          userId: ctx.userId,
          amount: amountUSD,
          isSubscription: input.isSubscription,
        },
      });

      // Check if collection should be blocked (only if target amount is set)
      if (collection.amount != null) {
        const totalAmount = await ctx.db.obligation.aggregate({
          where: { collectionId: input.collectionId },
          _sum: { amount: true },
        });
        if ((totalAmount._sum.amount ?? 0) >= collection.amount) {
          await ctx.db.collection.update({
            where: { id: input.collectionId },
            data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: null },
          });

          // Mark existing NEW_COLLECTION/RE_NOTIFY notifications as EXPIRED
          await ctx.db.notification.updateMany({
            where: {
              collectionId: input.collectionId,
              type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
              status: { in: ['UNREAD', 'READ'] },
            },
            data: { status: 'EXPIRED' },
          });

          // Create COLLECTION_BLOCKED in-app notifications for non-participants (so they know they can relax)
          const notifiedUsers = await ctx.db.notification.findMany({
            where: { collectionId: input.collectionId },
            select: { userId: true },
            distinct: ['userId'],
          });
          const pledgedUserIds = new Set(
            (await ctx.db.obligation.findMany({
              where: { collectionId: input.collectionId },
              select: { userId: true },
            })).map((o) => o.userId),
          );
          const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
          for (const { userId: notifUserId } of notifiedUsers) {
            if (notifUserId === collection.creatorId) continue;
            if (pledgedUserIds.has(notifUserId)) continue; // already participating
            try {
              await ctx.db.notification.upsert({
                where: {
                  userId_collectionId_type_wave: {
                    userId: notifUserId, collectionId: input.collectionId, type: 'COLLECTION_BLOCKED', wave: 0,
                  },
                },
                create: {
                  userId: notifUserId, collectionId: input.collectionId,
                  type: 'COLLECTION_BLOCKED', handshakePath: [], expiresAt, wave: 0,
                },
                update: { status: 'UNREAD', expiresAt },
              });
            } catch { /* skip */ }
          }

          // TG notification only to the creator — participants wait for manual close
          sendGoalReachedToCreator(ctx.db, input.collectionId, collection.creatorId).catch((err) =>
            console.error('[TG GoalReached] Failed:', err),
          );
        }
      }

      return obligation;
    }),

  myList: protectedProcedure.query(async ({ ctx }) => {
    const obligations = await ctx.db.obligation.findMany({
      where: { userId: ctx.userId },
      include: {
        collection: {
          include: { creator: { select: { id: true, name: true, photoUrl: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get connection counts for all creators
    const creatorIds = [...new Set(obligations.map((o) => o.collection.creatorId))];
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

    return obligations.map((o) => ({
      ...o,
      collection: {
        ...o.collection,
        creator: {
          ...o.collection.creator,
          connectionCount: countMap.get(o.collection.creatorId) || 0,
        },
      },
    }));
  }),

  updateAmount: protectedProcedure
    .input(z.object({
      obligationId: z.string(),
      amount: z.number().int().min(MIN_OBLIGATION_AMOUNT), // whole $ only: 1 $ = 1 unit
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
    }))
    .mutation(async ({ ctx, input }) => {
      const obligation = await ctx.db.obligation.findUnique({
        where: { id: input.obligationId },
        include: { collection: true },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.userId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (obligation.collection.status !== 'ACTIVE' && obligation.collection.status !== 'BLOCKED') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
      }

      const newAmountUSD = input.amount;

      // Update obligation
      const updated = await ctx.db.obligation.update({
        where: { id: input.obligationId },
        data: {
          amount: newAmountUSD,
          originalAmount: null, // clear amounts typed in other currencies before SO-40
          originalCurrency: null,
        },
      });

      // Recalculate collection block status
      const collection = obligation.collection;
      if (collection.amount != null) {
        const totalAmount = await ctx.db.obligation.aggregate({
          where: { collectionId: collection.id },
          _sum: { amount: true },
        });
        const sum = totalAmount._sum.amount ?? 0;
        if (sum >= collection.amount && collection.status === 'ACTIVE') {
          await ctx.db.collection.update({
            where: { id: collection.id },
            data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: null },
          });

          // Mark existing notifications as EXPIRED and create COLLECTION_BLOCKED
          await ctx.db.notification.updateMany({
            where: {
              collectionId: collection.id,
              type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] },
              status: { in: ['UNREAD', 'READ'] },
            },
            data: { status: 'EXPIRED' },
          });

          // In-app notifications for non-participants
          const notifiedUsers = await ctx.db.notification.findMany({
            where: { collectionId: collection.id },
            select: { userId: true },
            distinct: ['userId'],
          });
          const pledgedUserIds = new Set(
            (await ctx.db.obligation.findMany({
              where: { collectionId: collection.id },
              select: { userId: true },
            })).map((o) => o.userId),
          );
          const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
          for (const { userId: notifUserId } of notifiedUsers) {
            if (notifUserId === collection.creatorId) continue;
            if (pledgedUserIds.has(notifUserId)) continue;
            try {
              await ctx.db.notification.upsert({
                where: {
                  userId_collectionId_type_wave: {
                    userId: notifUserId, collectionId: collection.id, type: 'COLLECTION_BLOCKED', wave: 0,
                  },
                },
                create: {
                  userId: notifUserId, collectionId: collection.id,
                  type: 'COLLECTION_BLOCKED', handshakePath: [], expiresAt, wave: 0,
                },
                update: { status: 'UNREAD', expiresAt },
              });
            } catch { /* skip */ }
          }

          // TG only to creator
          sendGoalReachedToCreator(ctx.db, collection.id, collection.creatorId).catch((err) =>
            console.error('[TG GoalReached] Failed:', err),
          );
        } else if (sum < collection.amount && collection.status === 'BLOCKED' && collection.blockReason == null) {
          // (an admin block, blockReason != null, is never lifted by the goal arithmetic)
          await ctx.db.collection.update({
            where: { id: collection.id },
            data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
          });

          // Collection unblocked: mark COLLECTION_BLOCKED notifications as EXPIRED
          await ctx.db.notification.updateMany({
            where: {
              collectionId: collection.id,
              type: 'COLLECTION_BLOCKED',
              status: { in: ['UNREAD', 'READ'] },
            },
            data: { status: 'EXPIRED' },
          });
        }
      }

      return updated;
    }),

  confirmPayment: protectedProcedure
    .input(z.object({ obligationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const obligation = await ctx.db.obligation.findUnique({
        where: { id: input.obligationId },
        include: { collection: true },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      // Toggle: confirm if not yet confirmed, unconfirm if already confirmed
      const confirmedAt = obligation.confirmedAt ? null : new Date();
      return ctx.db.obligation.update({
        where: { id: input.obligationId },
        data: { confirmedAt },
      });
    }),

  unsubscribe: protectedProcedure
    .input(z.object({ obligationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const obligation = await ctx.db.obligation.findUnique({
        where: { id: input.obligationId },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.userId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!obligation.isSubscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a subscription' });
      }
      return ctx.db.obligation.update({
        where: { id: input.obligationId },
        data: { unsubscribedAt: new Date() },
      });
    }),

  // Used from the renewal reminder notification — finds the caller's active
  // obligation in the given collection and marks it as unsubscribed.
  unsubscribeFromCollection: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const obligation = await ctx.db.obligation.findFirst({
        where: {
          collectionId: input.collectionId,
          userId: ctx.userId,
          unsubscribedAt: null,
        },
      });
      if (!obligation) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Active intention not found' });
      }
      return ctx.db.obligation.update({
        where: { id: obligation.id },
        data: { unsubscribedAt: new Date() },
      });
    }),

  /**
   * Caller keeps their amount for the current regular cycle.
   * Obligation has no cycle-ack column, so the ack is the CYCLE_RENEWED row
   * for this wave with status RESPONDED. expiresAt is past the cycle end,
   * otherwise the hourly cleanup would drop the ack mid-cycle.
   */
  confirmCycle: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({ where: { id: input.collectionId } });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.type !== 'REGULAR' || collection.cycleNumber < 2 || collection.currentCycleStart == null) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not waiting for a cycle confirmation' });
      }
      if (collection.status !== 'ACTIVE') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
      }
      const obligation = await ctx.db.obligation.findFirst({
        where: { collectionId: input.collectionId, userId: ctx.userId, unsubscribedAt: null },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active intention not found' });

      const cycleEnd = collection.currentCycleStart.getTime() + REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000;
      const expiresAt = new Date(cycleEnd + 8 * 24 * 60 * 60 * 1000);
      await ctx.db.notification.upsert({
        where: {
          userId_collectionId_type_wave: {
            userId: ctx.userId,
            collectionId: input.collectionId,
            type: 'CYCLE_RENEWED',
            wave: collection.cycleNumber,
          },
        },
        create: {
          userId: ctx.userId,
          collectionId: input.collectionId,
          type: 'CYCLE_RENEWED',
          handshakePath: [],
          expiresAt,
          wave: collection.cycleNumber,
          status: 'RESPONDED',
        },
        update: { status: 'RESPONDED', expiresAt },
      });
      return { ok: true as const };
    }),
});
