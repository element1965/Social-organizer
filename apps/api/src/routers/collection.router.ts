import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MAX_CHAT_LINK_LENGTH, MIN_COLLECTION_AMOUNT, NOTIFICATION_RATIO } from '@so/shared';
import { sendCollectionNotifications } from '../services/notification.service.js';
import { dispatchPendingNeedNotices, enqueueNeedNotice } from '../services/notice-delivery.js';
import { isAdmin } from '../admin.js';
import { invalidateGraph } from '../services/graph-cache.service.js';
import { recordOpened } from '../services/notify-routing.service.js';
import { waitingNeedRequests } from '../services/need-attention.js';
import { getAskAccess, assertAskAllowed, isSpecialAsker } from '../services/ask-access.service.js';
import { accountScope, assertAccount } from '../services/account-scope.js';
import { ADMIN_BLOCK_REASONS } from '../config/ask.js';
import { activeObligationTotals, applyCollectionGoal, dispatchCollectionGoalReached, syncCollectionGoal } from '../services/collection-amount.js';
import { lockActiveNeedAccount, lockNeed } from '../services/collection-state.js';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { settleOpenReviews } from '../services/moderation.service.js';
import { syncMilestonesQuietly } from '../services/milestone.service.js';
import { getDirectConnectionCounts } from '../services/direct-connection-counts.js';
import { needAudience, chatLinkFor, confirmedRenewals, cycleConfirmation, isRenewal, needsCycleConfirmation } from '../services/collection-view.js';

/** Chat links are shown as buttons: https only, never javascript: or http (SO-14). */
const chatLinkSchema = z.string().max(MAX_CHAT_LINK_LENGTH).url().refine((u) => /^https:\/\//i.test(u), 'Link must start with https://');

/** What the collection is for: plain text, shown as text only (never HTML). Empty becomes null. */
const descriptionSchema = z.string().trim().max(300);
const toDescription = (value: string | undefined) => (value ? value : null);

const OPEN_STATUSES = ['ACTIVE', 'BLOCKED'] as const;

function requireUpdated<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new TRPCError({ code: 'CONFLICT', message: 'Collection changed before the action could be saved' });
  return row;
}

function assertAdmin(userId: string) {
  if (!isAdmin(userId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can block collections' });
}

export const collectionRouter = router({
  /** Whether the user may create a request, with the numbers the "path to request" card renders. */
  askAccess: protectedProcedure.input(accountScope).query(async ({ ctx, input }) => {
    assertAccount(ctx.userId, input);
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
      return ctx.db.$transaction(async (tx) => {
        const blocked = requireUpdated(await tx.collection.updateManyAndReturn({
          where: { id: input.id, status: 'ACTIVE', blockReason: collection.blockReason },
          data: { status: 'BLOCKED', blockedAt: new Date(), blockReason: input.reason },
          omit: { chatLink: true },
        }));
        // Pending requests are no longer actionable.
        await tx.notification.updateMany({
          where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: { in: ['UNREAD', 'READ'] } },
          data: { status: 'EXPIRED' },
        });
        return blocked;
      });
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
      requireUpdated(await ctx.db.collection.updateManyAndReturn({
        where: { id: input.id, status: 'BLOCKED', blockReason: collection.blockReason },
        data: { status: 'ACTIVE', blockedAt: null, blockReason: null },
      }));
      // A goal hold must come back if the circle (or an admin) lift was the only reason it stayed paused.
      await syncCollectionGoal(ctx.db, input.id);
      return ctx.db.collection.findUniqueOrThrow({ where: { id: input.id }, omit: { chatLink: true } });
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
      const removed = await ctx.db.connection.deleteMany({ where: { id: connection.id, viaCollectionId: input.collectionId } });
      if (removed.count === 0) throw new TRPCError({ code: 'CONFLICT', message: 'The connection changed before it could be removed' });
      invalidateGraph([userAId!, userBId!]);
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

      const amountUSD = input.amount;

      // Limit: max 1 emergency + 1 regular at the same time. The check and the insert run under a lock on
      // creator + type (SEC-7), so concurrent requests cannot both see "none active" and both create.
      const collection = await transactionWithRetry(ctx.db, async (tx) => {
        await lockActiveNeedAccount(tx, ctx.userId);
        // 64-bit key, domain-separated from the other advisory locks (e-mail codes, push subscriptions)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`need-create:${ctx.userId}:${input.type}`}, 0))`;
        const existingActive = await tx.collection.count({
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
        return tx.collection.create({
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
      });
      await syncMilestonesQuietly(ctx.db, ctx.userId); // "first Need"

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
      const owner = collection.creatorId === ctx.userId;
      // The author has seen the responses: they won't come again in the grouped message (SO-45)
      if (owner) {
        // Raw SQL on purpose: an ORM update would also move "updatedAt", which other people's apps watch
        // (notification.pulse) — the author keeping the page open would make every notified person refetch
        ctx.db.$executeRaw`UPDATE collections SET "creatorViewedAt" = NOW() WHERE id = ${collection.id}`
          .catch(() => {});
      }

      // Amounts and chat link by viewer role (SEC-6): the author and active participants see who and how much,
      // anyone else who takes part without amounts
      const audience = needAudience(ctx.userId, collection.creatorId, collection.obligations);
      const visible = audience.active;

      // Connection counts: the creator's for everyone, the participants' only for those who see the full list
      const userIds = [collection.creatorId, ...(audience.seesAmounts ? visible.map((o) => o.userId) : [])];
      const countMap = await getDirectConnectionCounts(ctx.db, userIds);
      const renewal = isRenewal(collection);
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
      if (owner) {
        const links = await ctx.db.connection.findMany({
          where: { viaCollectionId: collection.id },
          select: { userAId: true, userBId: true },
        });
        for (const link of links) {
          const other = link.userAId === collection.creatorId ? link.userBId : link.userAId;
          viaLink.add(other);
        }
      }

      const totals = await activeObligationTotals(ctx.db, collection.id);
      const currentAmount = totals.amount;
      const ownConfirmed = acked.has(ctx.userId);
      const needsConfirmation = !owner && needsCycleConfirmation(collection, audience.own, ownConfirmed);
      if (!owner) {
        await recordOpened(ctx.db, ctx.userId, collection.id, needsConfirmation ? collection.cycleNumber : undefined)
          .catch((err) => console.error('[notify-stats] open', err));
      }
      const request = owner || audience.own ? null : await ctx.db.notification.findFirst({
        where: { ...waitingNeedRequests(ctx.userId, new Date()), collectionId: collection.id },
        orderBy: { expiresAt: 'desc' },
        select: { expiresAt: true },
      });
      return {
        ...collection,
        waitingForMe: !!request || needsConfirmation,
        waitingExpiresAt: request?.expiresAt ?? null,
        needsCycleConfirmation: needsConfirmation,
        // The participants' chat: the author, and a participant while the page offers the chat
        chatLink: chatLinkFor(collection, ctx.userId, audience.own, ownConfirmed),
        currentAmount,
        /** Active Participations in total. */
        participantCount: totals.count,
        creator: {
          ...collection.creator,
          connectionCount: countMap.get(collection.creatorId) || 0,
        },
        obligations: visible.map((o) => ({
          ...o,
          // Who gave how much is for the author and the participants; others see the people only
          amount: audience.seesAmounts ? o.amount : null,
          originalAmount: audience.seesAmounts ? o.originalAmount : null,
          originalCurrency: audience.seesAmounts ? o.originalCurrency : null,
          // The received mark is the author's own record; other viewers never get it.
          confirmedAt: owner ? o.confirmedAt : null,
          user: {
            ...o.user,
            connectionCount: audience.seesAmounts ? countMap.get(o.userId) || 0 : null,
          },
          /** null outside a renewal cycle; false until the person confirms the new cycle. */
          cycleConfirmed: cycleConfirmation(collection, o, acked.has(o.userId)),
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

      const { updated, hold } = await transactionWithRetry(ctx.db, async (tx) => {
        const locked = await lockNeed(tx, input.id);
        if ((locked.status !== 'ACTIVE' && locked.status !== 'BLOCKED') ||
          locked.blockReason != null || locked.amount !== collection.amount) {
          throw new TRPCError({ code: 'CONFLICT', message: 'Collection changed before the action could be saved' });
        }
        const hold = await applyCollectionGoal(tx, input.id, { ...locked, amount: amountUSD });
        const updated = await tx.collection.update({
          where: { id: input.id },
          data: {
            amount: amountUSD,
            originalAmount: null, // Clear goals entered in other currencies before SO-40.
            originalCurrency: null,
          },
        });
        return { updated, hold };
      });

      if (hold) await dispatchCollectionGoalReached(ctx.db, input.id, hold).catch((err) =>
        console.error('[updateAmount] Goal notice dispatch failed:', err),
      );

      // An increased goal can notify additional recipients only while the Need is active.
      const oldAmount = collection.amount;
      if (updated.status === 'ACTIVE' && amountUSD != null && (oldAmount == null || amountUSD > oldAmount)) {
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
      return requireUpdated(await ctx.db.collection.updateManyAndReturn({
        where: { id: input.id, status: { in: [...OPEN_STATUSES] } },
        data: { description: toDescription(input.description) },
      }));
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
      const updated = await transactionWithRetry(ctx.db, async (tx) => {
        const closed = requireUpdated(await tx.collection.updateManyAndReturn({
          where: { id: input.id, status: { in: [...OPEN_STATUSES] } },
          data: { status: 'CLOSED', closedAt: new Date() },
        }));
        await tx.notification.updateMany({
          where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: 'UNREAD' },
          data: { status: 'READ' },
        });

        // Everyone previously notified gets a single closure notice.
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const notified = await tx.$queryRaw<{ userId: string }[]>`
          INSERT INTO notifications ("id", "userId", "collectionId", "type", "expiresAt", "wave", "updatedAt")
          SELECT gen_random_uuid()::text, notified."userId", ${input.id}, 'COLLECTION_CLOSED'::"NotificationType",
            ${expiresAt.toISOString()}::timestamptz AT TIME ZONE 'UTC', 0, CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
          FROM (SELECT DISTINCT "userId" FROM notifications WHERE "collectionId" = ${input.id}) notified
          ON CONFLICT ("userId", "collectionId", "type", "wave") DO UPDATE
            SET "status" = 'UNREAD', "expiresAt" = EXCLUDED."expiresAt", "updatedAt" = EXCLUDED."updatedAt"
          RETURNING "userId"
        `;
        await enqueueNeedNotice(tx, 'closed', input.id, 0,
          notified.map(({ userId }) => userId).filter((id) => id !== ctx.userId));
        return closed;
      });

      dispatchPendingNeedNotices(ctx.db, ['closed'], input.id).catch((err) =>
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
      return ctx.db.$transaction(async (tx) => {
        const cancelled = requireUpdated(await tx.collection.updateManyAndReturn({
          where: { id: input.id, status: 'ACTIVE' },
          data: { status: 'CANCELLED' },
        }));
        await tx.notification.updateMany({
          where: { collectionId: input.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: 'UNREAD' },
          data: { status: 'READ' },
        });
        return cancelled;
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
    const confirmed = await confirmedRenewals(ctx.db, ctx.userId, rows.map((row) => row.collection));
    return rows.map((row) => {
      const { obligations, ...collection } = row.collection;
      const active = obligations.filter((o) => o.unsubscribedAt == null);
      return {
        ...row,
        confirmedAt: collection.creatorId === ctx.userId ? row.confirmedAt : null,
        collection: {
          ...collection,
          // The same rule as the Need page (SEC-6): not while closed, held or waiting for a cycle confirmation
          chatLink: chatLinkFor(collection, ctx.userId, row, confirmed.has(`${collection.id}:${collection.cycleNumber}`)),
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
