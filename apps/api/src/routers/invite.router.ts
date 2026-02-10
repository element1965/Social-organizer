import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { sendPendingNotification } from '../services/notification.service.js';

export const inviteRouter = router({
  generate: protectedProcedure.mutation(async ({ ctx }) => {
    const token = randomBytes(16).toString('hex');
    const invite = await ctx.db.inviteLink.create({
      data: { inviterId: ctx.userId, token },
    });
    return { token: invite.token, id: invite.id };
  }),

  accept: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      console.log('[invite.accept] userId:', ctx.userId, 'token:', input.token.slice(0, 8) + '...');

      // Try single-use invite token first
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
      });

      let inviterId: string;

      if (invite) {
        if (invite.usedById) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite already used' });
        if (invite.inviterId === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot accept own invite' });
        }
        inviterId = invite.inviterId;

        await ctx.db.inviteLink.update({
          where: { id: invite.id },
          data: { usedById: ctx.userId, usedAt: new Date() },
        });
      } else {
        // Try as permanent link (token = userId), then by referralSlug
        let user = await ctx.db.user.findUnique({ where: { id: input.token } });
        if (!user) {
          user = await ctx.db.user.findUnique({ where: { referralSlug: input.token.toLowerCase() } });
        }
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
        if (user.id === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself' });
        }
        inviterId = user.id;
      }

      // Check if already connected
      const [userAId, userBId] = [ctx.userId, inviterId].sort();
      const existingConnection = await ctx.db.connection.findUnique({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
      });
      if (existingConnection) {
        console.log('[invite.accept] already connected:', ctx.userId, '<->', inviterId);
        return { success: true, alreadyConnected: true, connectedWith: inviterId };
      }

      // Check if pending connection already exists
      const existingPending = await ctx.db.pendingConnection.findUnique({
        where: { fromUserId_toUserId: { fromUserId: ctx.userId, toUserId: inviterId } },
      });
      if (existingPending && existingPending.status === 'PENDING') {
        return { success: true, pending: true, connectedWith: inviterId };
      }

      // Create pending connection (fromUser = person clicking link, toUser = link owner)
      await ctx.db.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: ctx.userId, toUserId: inviterId } },
        create: { fromUserId: ctx.userId, toUserId: inviterId },
        update: { status: 'PENDING', resolvedAt: null },
      });

      console.log('[invite.accept] pending connection created:', ctx.userId, '->', inviterId);

      // TG notification to link owner (fire-and-forget)
      const applicant = await ctx.db.user.findUnique({ where: { id: ctx.userId }, select: { name: true } });
      sendPendingNotification(ctx.db, inviterId, 'new', applicant?.name || '').catch(() => {});

      return { success: true, pending: true, connectedWith: inviterId };
    }),

  getByToken: publicProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      // Try single-use invite first
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
        include: { inviter: { select: { id: true, name: true, photoUrl: true } } },
      });
      if (invite) return invite;

      // Try as permanent link (token = userId), then by referralSlug
      let user = await ctx.db.user.findUnique({
        where: { id: input.token },
        select: { id: true, name: true, photoUrl: true },
      });
      if (!user) {
        user = await ctx.db.user.findUnique({
          where: { referralSlug: input.token.toLowerCase() },
          select: { id: true, name: true, photoUrl: true },
        });
      }
      if (user) {
        return {
          id: `permanent-${user.id}`,
          token: input.token,
          inviterId: user.id,
          usedById: null,
          usedAt: null,
          createdAt: new Date(),
          inviter: user,
        };
      }

      throw new TRPCError({ code: 'NOT_FOUND' });
    }),
});
