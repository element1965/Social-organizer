import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, protectedProcedure } from '../trpc';
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
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invite not found' });
      if (invite.usedById) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invite already used' });
      if (invite.inviterId === ctx.userId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot accept own invite' });
      }

      await ctx.db.inviteLink.update({
        where: { id: invite.id },
        data: { usedById: ctx.userId, usedAt: new Date() },
      });

      // Create bidirectional connection (sorted for dedup)
      const [userAId, userBId] = [ctx.userId, invite.inviterId].sort();
      await ctx.db.connection.upsert({
        where: { userAId_userBId: { userAId: userAId!, userBId: userBId! } },
        create: { userAId: userAId!, userBId: userBId! },
        update: {},
      });

      return { success: true, connectedWith: invite.inviterId };
    }),

  getByToken: protectedProcedure
    .input(z.object({ token: z.string() }))
    .query(async ({ ctx, input }) => {
      const invite = await ctx.db.inviteLink.findUnique({
        where: { token: input.token },
        include: { inviter: { select: { id: true, name: true, photoUrl: true } } },
      });
      if (!invite) throw new TRPCError({ code: 'NOT_FOUND' });
      return invite;
    }),
});
