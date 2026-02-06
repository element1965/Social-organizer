import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, publicProcedure, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

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
        // Try as permanent link (token = userId)
        const user = await ctx.db.user.findUnique({ where: { id: input.token } });
        if (!user) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
        if (user.id === ctx.userId) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot connect to yourself' });
        }
        inviterId = user.id;
      }

      // Create bidirectional connection (sorted for dedup)
      const [userAId, userBId] = [ctx.userId, inviterId].sort();
      await ctx.db.connection.upsert({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
        create: { userAId: userAId!, userBId: userBId! },
        update: {},
      });

      console.log('[invite.accept] connection created:', ctx.userId, '<->', inviterId);
      return { success: true, connectedWith: inviterId };
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

      // Try as permanent link (token = userId)
      const user = await ctx.db.user.findUnique({
        where: { id: input.token },
        select: { id: true, name: true, photoUrl: true },
      });
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
