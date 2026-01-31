import { z } from 'zod';
import { randomBytes } from 'crypto';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { MAX_CONNECTIONS } from '@so/shared';

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

      // Проверка лимита связей у обоих
      const [myCount, inviterCount] = await Promise.all([
        ctx.db.connection.count({
          where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
        }),
        ctx.db.connection.count({
          where: { OR: [{ userAId: invite.inviterId }, { userBId: invite.inviterId }] },
        }),
      ]);
      if (myCount >= MAX_CONNECTIONS) {
        throw new TRPCError({ code: 'FORBIDDEN', message: `Connection limit reached (${MAX_CONNECTIONS})` });
      }
      if (inviterCount >= MAX_CONNECTIONS) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Inviter has reached connection limit' });
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
