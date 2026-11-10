import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_OBLIGATION_AMOUNT, REGULAR_CYCLE_DAYS } from '@so/shared';
import { syncCollectionGoal } from '../services/collection-amount.js';
import { scheduleResponseDigest } from '../services/notification.service.js';
import { recordResponded } from '../services/notify-routing.service.js';
import { syncMilestonesQuietly } from '../services/milestone.service.js';

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

      // The author hears about responses as one grouped message, not one per person (SO-45)
      if (collection.creatorId !== ctx.userId) {
        recordResponded(ctx.db, ctx.userId, input.collectionId).catch((err) => console.error('[notify-stats] respond', err));
        scheduleResponseDigest(ctx.db, input.collectionId).catch((err) =>
          console.error('[obligation.create] response digest not planned:', err),
        );
      }

      await syncCollectionGoal(ctx.db, input.collectionId);
      await syncMilestonesQuietly(ctx.db, ctx.userId); // "first Participation"
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

      await syncCollectionGoal(ctx.db, obligation.collectionId);
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

  /**
   * Mark several transfers as received (or clear the mark) in one go. Idempotent, unlike the
   * confirmPayment toggle: rows already in the wanted state are left alone. Author only, one collection.
   */
  setPaid: protectedProcedure
    .input(z.object({ obligationIds: z.array(z.string()).min(1).max(500), paid: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const ids = [...new Set(input.obligationIds)];
      const rows = await ctx.db.obligation.findMany({
        where: { id: { in: ids } },
        select: { id: true, collectionId: true, collection: { select: { creatorId: true } } },
      });
      if (rows.length !== ids.length) throw new TRPCError({ code: 'NOT_FOUND' });
      if (rows.some((row) => row.collection.creatorId !== ctx.userId)) throw new TRPCError({ code: 'FORBIDDEN' });
      if (new Set(rows.map((row) => row.collectionId)).size > 1) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Transfers must belong to one collection' });
      }
      const result = await ctx.db.obligation.updateMany({
        where: { id: { in: ids }, confirmedAt: input.paid ? null : { not: null } },
        data: { confirmedAt: input.paid ? new Date() : null },
      });
      return { changed: result.count };
    }),

  /**
   * Author-only history of "received" marks per finished cycle of a regular collection.
   * The marks are the author's private record: nobody else can read this. Cycles with no marks are
   * listed with zeros (a missing mark means "not marked", nothing more). Period dates are derived
   * from the current cycle start, so they are approximate by the hourly lag of the close job.
   */
  receiptHistory: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const collection = await ctx.db.collection.findUnique({
        where: { id: input.collectionId },
        select: { creatorId: true, type: true, cycleNumber: true, currentCycleStart: true },
      });
      if (!collection) throw new TRPCError({ code: 'NOT_FOUND' });
      if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (collection.type !== 'REGULAR') return { cycles: [] };

      const receipts = await ctx.db.obligationReceipt.findMany({
        where: { collectionId: input.collectionId, cycleNumber: { gte: collection.cycleNumber - 12 } },
        include: { user: { select: { id: true, name: true, photoUrl: true } } },
        orderBy: [{ cycleNumber: 'desc' }, { confirmedAt: 'asc' }],
      });
      if (receipts.length === 0) return { cycles: [] };

      const byCycle = new Map<number, typeof receipts>();
      for (const r of receipts) byCycle.set(r.cycleNumber, [...(byCycle.get(r.cycleNumber) ?? []), r]);

      const cycleMs = REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000;
      const current = collection.currentCycleStart?.getTime() ?? null;
      const cycles: Array<{
        cycleNumber: number;
        startsAt: Date | null;
        endsAt: Date | null;
        markedCount: number;
        markedAmount: number;
        marked: Array<{ userId: string; name: string; photoUrl: string | null; amount: number; confirmedAt: Date }>;
      }> = [];
      const newest = collection.cycleNumber - 1;
      for (let n = newest; n >= 1 && cycles.length < 12; n--) {
        const rows = byCycle.get(n) ?? [];
        const endsAt = current != null ? current - (collection.cycleNumber - 1 - n) * cycleMs : null;
        cycles.push({
          cycleNumber: n,
          startsAt: endsAt != null ? new Date(endsAt - cycleMs) : null,
          endsAt: endsAt != null ? new Date(endsAt) : null,
          markedCount: rows.length,
          markedAmount: rows.reduce((sum, r) => sum + r.amount, 0),
          marked: rows.map((r) => ({
            userId: r.userId,
            name: r.user.name,
            photoUrl: r.user.photoUrl,
            amount: r.amount,
            confirmedAt: r.confirmedAt,
          })),
        });
      }
      return { cycles };
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
      const updated = await ctx.db.obligation.update({
        where: { id: input.obligationId },
        data: { unsubscribedAt: new Date() },
      });
      await syncCollectionGoal(ctx.db, updated.collectionId);
      return updated;
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
      const updated = await ctx.db.obligation.update({
        where: { id: obligation.id },
        data: { unsubscribedAt: new Date() },
      });
      // A goal-reached hold (blockReason null) opens again when the active total drops below the goal.
      await syncCollectionGoal(ctx.db, input.collectionId);
      return updated;
    }),

  /**
   * Acknowledgement only: the pledge already counts for this cycle.
   * Stored as the CYCLE_RENEWED row for this wave with status RESPONDED.
   * expiresAt is past the cycle end, otherwise the hourly cleanup would drop the ack mid-cycle.
   * markRead and dismiss leave RESPONDED rows alone so opening the notice does not clear it.
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
