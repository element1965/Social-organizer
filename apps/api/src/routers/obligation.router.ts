import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MIN_OBLIGATION_AMOUNT, REGULAR_CYCLE_DAYS } from '@so/shared';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { applyCollectionGoal, dispatchCollectionGoalReached, syncCollectionGoal } from '../services/collection-amount.js';
import { scheduleResponseDigest } from '../services/notification.service.js';
import { dismissNeedRequests, recordResponded } from '../services/notify-routing.service.js';
import { syncMilestonesQuietly } from '../services/milestone.service.js';
import { getDirectConnectionCounts } from '../services/direct-connection-counts.js';
import { chatLinkFor, confirmedRenewals } from '../services/collection-view.js';
import { assertOpenNeed, lockNeed } from '../services/collection-state.js';

const displayedCycle = z.object({ collectionId: z.string(), cycleNumber: z.number().int().positive() });

function assertCurrentCycle(current: number, displayed: number): void {
  if (current !== displayed) {
    throw new TRPCError({ code: 'CONFLICT', message: 'The Need has moved to a different cycle' });
  }
}

export const obligationRouter = router({
  create: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      amount: z.number().int().min(MIN_OBLIGATION_AMOUNT), // whole $ only: 1 $ = 1 unit
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
      isSubscription: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const { collection, obligation } = await transactionWithRetry(ctx.db, async (tx) => {
        const collection = await lockNeed(tx, input.collectionId);
        assertOpenNeed(collection);
        if (collection.status !== 'ACTIVE') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
        }
        const obligation = await tx.obligation.create({
          data: {
            collectionId: input.collectionId,
            userId: ctx.userId,
            amount: input.amount,
            isSubscription: input.isSubscription,
          },
        });
        return { collection, obligation };
      });

      // The author hears about responses as one grouped message, not one per person (SO-45)
      if (collection.creatorId !== ctx.userId) {
        recordResponded(ctx.db, ctx.userId, input.collectionId).catch((err) => console.error('[notify-stats] respond', err));
        scheduleResponseDigest(ctx.db, input.collectionId).catch((err) =>
          console.error('[obligation.create] response digest not planned:', err),
        );
      }

      const earned = await syncMilestonesQuietly(ctx.db, ctx.userId);
      const firstParticipation = earned.some((m) =>
        m.kind === 'FIRST_PARTICIPATION' && m.obligationId === obligation.id);
      await syncCollectionGoal(ctx.db, input.collectionId);
      return { ...obligation, firstParticipation };
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
    const countMap = await getDirectConnectionCounts(ctx.db, creatorIds);
    const confirmed = await confirmedRenewals(ctx.db, ctx.userId, obligations.map((o) => o.collection));

    const activeIds = new Set(obligations.filter((o) => o.unsubscribedAt == null).map((o) => o.collectionId));
    return obligations.map((o) => {
      const owner = o.collection.creatorId === ctx.userId;
      const canSeeParticipation = owner || activeIds.has(o.collectionId);
      return {
        ...o,
        amount: canSeeParticipation ? o.amount : null,
        originalAmount: canSeeParticipation ? o.originalAmount : null,
        originalCurrency: canSeeParticipation ? o.originalCurrency : null,
        confirmedAt: owner ? o.confirmedAt : null,
        collection: {
          ...o.collection,
          // The same rule as the Need page (SEC-6): a declined Participation, a closed or held Need and a cycle
          // waiting for confirmation do not open the participants' chat
          chatLink: chatLinkFor(
            o.collection,
            ctx.userId,
            o.unsubscribedAt == null ? o : null,
            confirmed.has(`${o.collection.id}:${o.collection.cycleNumber}`),
          ),
          creator: {
            ...o.collection.creator,
            connectionCount: countMap.get(o.collection.creatorId) || 0,
          },
        },
      };
    });
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
        select: { userId: true, collectionId: true },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.userId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });

      const updated = await transactionWithRetry(ctx.db, async (tx) => {
        assertOpenNeed(await lockNeed(tx, obligation.collectionId));
        const [row] = await tx.obligation.updateManyAndReturn({
          where: { id: input.obligationId, unsubscribedAt: null },
          data: {
            amount: input.amount,
            originalAmount: null, // clear amounts typed in other currencies before SO-40
            originalCurrency: null,
          },
          omit: { confirmedAt: true },
        });
        if (!row) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Participation is no longer active' });
        return row;
      });

      await syncCollectionGoal(ctx.db, obligation.collectionId);
      return updated;
    }),

  confirmPayment: protectedProcedure
    .input(displayedCycle.extend({ obligationId: z.string() }))
    .mutation(({ ctx, input }) =>
      transactionWithRetry(ctx.db, async (tx) => {
        const collection = await lockNeed(tx, input.collectionId);
        if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
        assertCurrentCycle(collection.cycleNumber, input.cycleNumber);
        assertOpenNeed(collection);
        const current = await tx.obligation.findUnique({
          where: { id: input.obligationId, collectionId: input.collectionId },
          select: { confirmedAt: true },
        });
        if (!current) throw new TRPCError({ code: 'NOT_FOUND' });
        return tx.obligation.update({
          where: { id: input.obligationId },
          data: { confirmedAt: current.confirmedAt ? null : new Date() },
        });
      }),
    ),

  /**
   * Mark several transfers as received (or clear the mark) in one go. Idempotent, unlike the
   * confirmPayment toggle: rows already in the wanted state are left alone. Author only, one collection.
   */
  setPaid: protectedProcedure
    .input(displayedCycle.extend({ obligationIds: z.array(z.string()).min(1).max(500), paid: z.boolean() }))
    .mutation(({ ctx, input }) => {
      const ids = [...new Set(input.obligationIds)];
      return transactionWithRetry(ctx.db, async (tx) => {
        const collection = await lockNeed(tx, input.collectionId);
        if (collection.creatorId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
        assertCurrentCycle(collection.cycleNumber, input.cycleNumber);
        assertOpenNeed(collection);
        const rows = await tx.obligation.findMany({
          where: { id: { in: ids } },
          select: { collectionId: true, collection: { select: { creatorId: true } } },
        });
        if (rows.length !== ids.length) throw new TRPCError({ code: 'NOT_FOUND' });
        if (rows.some((row) => row.collection.creatorId !== ctx.userId)) throw new TRPCError({ code: 'FORBIDDEN' });
        if (rows.some((row) => row.collectionId !== input.collectionId)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Transfers must belong to one collection' });
        }
        const result = await tx.obligation.updateMany({
          where: { id: { in: ids }, confirmedAt: input.paid ? null : { not: null } },
          data: { confirmedAt: input.paid ? new Date() : null },
        });
        return { changed: result.count };
      });
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
        select: { userId: true, isSubscription: true, collectionId: true },
      });
      if (!obligation) throw new TRPCError({ code: 'NOT_FOUND' });
      if (obligation.userId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (!obligation.isSubscription) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not a subscription' });
      }
      const updated = await transactionWithRetry(ctx.db, async (tx) => {
        assertOpenNeed(await lockNeed(tx, obligation.collectionId));
        return tx.obligation.updateMany({
          where: { id: input.obligationId, unsubscribedAt: null },
          data: { unsubscribedAt: new Date() },
        });
      });
      if (updated.count > 0) await syncCollectionGoal(ctx.db, obligation.collectionId);
      return { ok: true as const };
    }),

  // Used by the Need page and renewal reminder to withdraw all of the viewer's Participation.
  unsubscribeFromCollection: protectedProcedure
    .input(z.object({ collectionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const updated = await transactionWithRetry(ctx.db, async (tx) => {
        assertOpenNeed(await lockNeed(tx, input.collectionId));
        const result = await tx.obligation.updateMany({
          where: { collectionId: input.collectionId, userId: ctx.userId, unsubscribedAt: null },
          data: { unsubscribedAt: new Date() },
        });
        if (result.count > 0) await dismissNeedRequests(tx, ctx.userId, input.collectionId);
        return result;
      });
      // A goal-reached hold (blockReason null) opens again when the active total drops below the goal.
      if (updated.count > 0) await syncCollectionGoal(ctx.db, input.collectionId);
      return { ok: true as const };
    }),

  /**
   * Acknowledgement only: the pledge already counts for this cycle.
   * Stored as the CYCLE_RENEWED row for this wave with status RESPONDED.
   * expiresAt is past the cycle end, otherwise the hourly cleanup would drop the ack mid-cycle.
   * markRead and dismiss leave RESPONDED rows alone so opening the notice does not clear it.
   */
  confirmCycle: protectedProcedure
    .input(displayedCycle.extend({
      pledge: z.object({ obligationId: z.string(), amount: z.number().int().min(MIN_OBLIGATION_AMOUNT) }).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const hold = await transactionWithRetry(ctx.db, async (tx) => {
        const collection = await lockNeed(tx, input.collectionId);
        assertCurrentCycle(collection.cycleNumber, input.cycleNumber);
        assertOpenNeed(collection);
        if (collection.type !== 'REGULAR' || collection.cycleNumber < 2 || collection.currentCycleStart == null) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not waiting for a cycle confirmation' });
        }
        if (collection.status !== 'ACTIVE') {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not active' });
        }
        const obligation = await tx.obligation.findFirst({
          where: {
            id: input.pledge?.obligationId,
            collectionId: input.collectionId,
            userId: ctx.userId,
            unsubscribedAt: null,
          },
          select: { id: true },
        });
        if (!obligation) throw new TRPCError({ code: 'NOT_FOUND', message: 'Active intention not found' });

        if (input.pledge) {
          await tx.obligation.update({
            where: { id: obligation.id },
            data: { amount: input.pledge.amount, originalAmount: null, originalCurrency: null },
          });
        }

        const cycleEnd = collection.currentCycleStart.getTime() + REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000;
        const expiresAt = new Date(cycleEnd + 8 * 24 * 60 * 60 * 1000);
        await tx.notification.upsert({
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
        if (input.pledge) return applyCollectionGoal(tx, input.collectionId, collection);
      });
      if (hold) {
        await dispatchCollectionGoalReached(ctx.db, input.collectionId, hold).catch((err) =>
          console.error('[obligation.confirmCycle] Goal notice dispatch failed:', err),
        );
      }
      return { ok: true as const };
    }),
});
