import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { sendPendingNotification } from '../services/notification.service.js';
import { cooldownUntil, openConnectionRequest, respondToConnectionRequest } from '../services/connection-request.service.js';
import { syncMilestones } from '../services/milestone.service.js';

export { REQUEST_COOLDOWN_MS } from '../services/connection-request.service.js';

export const pendingRouter = router({
  incoming: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.pendingConnection.findMany({
      where: { toUserId: ctx.userId, status: 'PENDING' },
      include: { fromUser: { select: { id: true, name: true, photoUrl: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }),

  myPending: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.pendingConnection.findMany({
      where: { fromUserId: ctx.userId, status: 'PENDING' },
      include: { toUser: { select: { id: true, name: true, photoUrl: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }),

  /**
   * First acquaintance for the current user: the latest request they sent (normally to whoever invited them)
   * and its exact state. Drives the "Acquaintance" card after sign-in.
   */
  introStatus: protectedProcedure.query(async ({ ctx }) => {
    const pending = await ctx.db.pendingConnection.findFirst({
      where: { fromUserId: ctx.userId },
      orderBy: { createdAt: 'desc' },
      include: { toUser: { select: { id: true, name: true, photoUrl: true, deletedAt: true } } },
    });
    const connectionCount = await ctx.db.connection.count({
      where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
    });
    if (!pending) return { state: 'none' as const, person: null, connectionCount };

    const person = { id: pending.toUser.id, name: pending.toUser.name, photoUrl: pending.toUser.photoUrl };
    const [userAId, userBId] = [ctx.userId, pending.toUserId].sort();
    const connected = await ctx.db.connection.findUnique({
      where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
    });
    if (connected) {
      // "First handshake" only for the connection that actually reached the first milestone
      await syncMilestones(ctx.db, ctx.userId, { silent: true });
      const first = await ctx.db.userMilestone.findUnique({
        where: { userId_kind: { userId: ctx.userId, kind: 'FIRST_CONNECTION' } },
        select: { relatedUserId: true },
      });
      return { state: 'connected' as const, person, connectionCount, isFirstHandshake: first?.relatedUserId === person.id };
    }
    if (pending.toUser.deletedAt) return { state: 'personDeleted' as const, person, connectionCount };
    if (pending.status === 'PENDING') return { state: 'waiting' as const, person, connectionCount };
    if (pending.status === 'REJECTED') return { state: 'declined' as const, person, connectionCount };
    return { state: 'none' as const, person: null, connectionCount };
  }),

  incomingCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.pendingConnection.count({
      where: { toUserId: ctx.userId, status: 'PENDING' },
    });
    return { count };
  }),

  accept: protectedProcedure
    .input(z.object({ pendingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await respondToConnectionRequest(ctx.db, input.pendingId, ctx.userId, 'accept');
      return { success: true, outcome: res.outcome };
    }),

  sendDirectRequest: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.targetUserId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot send request to yourself' });
      }

      const [userAId, userBId] = [ctx.userId, input.targetUserId].sort();
      const existingConnection = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existingConnection) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Already connected' });
      }

      const existingPending = await ctx.db.pendingConnection.findFirst({
        where: {
          OR: [
            { fromUserId: ctx.userId, toUserId: input.targetUserId, status: 'PENDING' },
            { fromUserId: input.targetUserId, toUserId: ctx.userId, status: 'PENDING' },
          ],
        },
      });

      // If reverse pending exists (target already sent request to me) — sending back counts as consent
      if (existingPending && existingPending.fromUserId === input.targetUserId) {
        await respondToConnectionRequest(ctx.db, existingPending.id, ctx.userId, 'accept');
        return { success: true, autoConnected: true };
      }

      if (existingPending) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Request already pending' });
      }

      // Declined, cooling down after a withdrawal, or a parallel request first: the shared rules decide
      const created = await openConnectionRequest(ctx.db, ctx.userId, input.targetUserId);
      if (!created) throw new TRPCError({ code: 'CONFLICT', message: 'Request already pending' });

      const [sender, senderTgContact] = await Promise.all([
        ctx.db.user.findUnique({
          where: { id: ctx.userId },
          select: { name: true },
        }),
        ctx.db.userContact.findUnique({
          where: { userId_type: { userId: ctx.userId, type: 'telegram' } },
          select: { value: true },
        }),
      ]);
      sendPendingNotification(ctx.db, input.targetUserId, 'new', sender?.name || '', senderTgContact?.value || undefined, created.id).catch(() => {});

      return { success: true };
    }),

  directStatus: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .query(async ({ ctx, input }) => {
      const pending = await ctx.db.pendingConnection.findFirst({
        where: {
          OR: [
            { fromUserId: ctx.userId, toUserId: input.targetUserId },
            { fromUserId: input.targetUserId, toUserId: ctx.userId },
          ],
        },
        orderBy: { createdAt: 'desc' },
      });
      if (!pending) return { status: 'none' as const, retryAt: null, mine: false };
      // After the current user withdrew a request: when a new one can be sent (null once the cooldown is over)
      const until = pending.status === 'CANCELLED' && pending.fromUserId === ctx.userId ? cooldownUntil(pending.resolvedAt) : 0;
      return {
        status: pending.status.toLowerCase() as 'pending' | 'accepted' | 'rejected' | 'cancelled',
        retryAt: until > Date.now() ? new Date(until).toISOString() : null,
        /** The row is the current user's own request (so 'rejected' means the other person declined it) */
        mine: pending.fromUserId === ctx.userId,
      };
    }),

  /**
   * Withdraws the current user's own unanswered request to a person. The row is kept as CANCELLED:
   * a new request to the same person is possible only after REQUEST_COOLDOWN_MS.
   */
  cancel: protectedProcedure
    .input(z.object({ targetUserId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date();
      const res = await ctx.db.pendingConnection.updateMany({
        where: { fromUserId: ctx.userId, toUserId: input.targetUserId, status: 'PENDING' },
        data: { status: 'CANCELLED', resolvedAt: now },
      });
      return { cancelled: res.count > 0, retryAt: new Date(cooldownUntil(now)).toISOString() };
    }),

  reject: protectedProcedure
    .input(z.object({ pendingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await respondToConnectionRequest(ctx.db, input.pendingId, ctx.userId, 'reject');
      return { success: true, outcome: res.outcome };
    }),
});
