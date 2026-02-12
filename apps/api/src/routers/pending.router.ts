import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { sendPendingNotification } from '../services/notification.service.js';

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

  incomingCount: protectedProcedure.query(async ({ ctx }) => {
    const count = await ctx.db.pendingConnection.count({
      where: { toUserId: ctx.userId, status: 'PENDING' },
    });
    return { count };
  }),

  accept: protectedProcedure
    .input(z.object({ pendingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pending = await ctx.db.pendingConnection.findUnique({
        where: { id: input.pendingId },
        include: { fromUser: { select: { id: true, name: true, language: true } } },
      });
      if (!pending) throw new TRPCError({ code: 'NOT_FOUND' });
      if (pending.toUserId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (pending.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already resolved' });

      // Update pending status
      await ctx.db.pendingConnection.update({
        where: { id: input.pendingId },
        data: { status: 'ACCEPTED', resolvedAt: new Date() },
      });

      // Create bidirectional connection
      const [userAId, userBId] = [pending.fromUserId, pending.toUserId].sort();
      await ctx.db.connection.upsert({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
        create: { userAId: userAId!, userBId: userBId! },
        update: {},
      });

      // TG notification to fromUser (fire-and-forget)
      const acceptor = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      sendPendingNotification(ctx.db, pending.fromUserId, 'accepted', acceptor?.name || '').catch(() => {});

      return { success: true };
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

      // If reverse pending exists (target already sent request to me) — auto-connect
      if (existingPending && existingPending.fromUserId === input.targetUserId) {
        await ctx.db.pendingConnection.update({
          where: { id: existingPending.id },
          data: { status: 'ACCEPTED', resolvedAt: new Date() },
        });
        const [userAId, userBId] = [ctx.userId, input.targetUserId].sort();
        await ctx.db.connection.upsert({
          where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
          create: { userAId: userAId!, userBId: userBId! },
          update: {},
        });
        const sender = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
        sendPendingNotification(ctx.db, input.targetUserId, 'accepted', sender?.name || '').catch(() => {});
        return { success: true, autoConnected: true };
      }

      if (existingPending) {
        throw new TRPCError({ code: 'CONFLICT', message: 'Request already pending' });
      }

      await ctx.db.pendingConnection.create({
        data: { fromUserId: ctx.userId, toUserId: input.targetUserId, createdAt: new Date() },
      });

      const sender = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      sendPendingNotification(ctx.db, input.targetUserId, 'new', sender?.name || '').catch(() => {});

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
      if (!pending) return { status: 'none' as const };
      return { status: pending.status.toLowerCase() as 'pending' | 'accepted' | 'rejected' };
    }),

  reject: protectedProcedure
    .input(z.object({ pendingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pending = await ctx.db.pendingConnection.findUnique({
        where: { id: input.pendingId },
      });
      if (!pending) throw new TRPCError({ code: 'NOT_FOUND' });
      if (pending.toUserId !== ctx.userId) throw new TRPCError({ code: 'FORBIDDEN' });
      if (pending.status !== 'PENDING') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already resolved' });

      await ctx.db.pendingConnection.update({
        where: { id: input.pendingId },
        data: { status: 'REJECTED', resolvedAt: new Date() },
      });

      // TG notification to fromUser (fire-and-forget)
      const rejector = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      sendPendingNotification(ctx.db, pending.fromUserId, 'rejected', rejector?.name || '').catch(() => {});

      return { success: true };
    }),
});
