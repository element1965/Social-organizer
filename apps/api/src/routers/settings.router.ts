import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { language: true, theme: true, soundEnabled: true, fontScale: true },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return user;
  }),

  updateLanguage: protectedProcedure
    .input(z.object({ language: z.string().min(2).max(5) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { language: input.language } });
    }),

  updateTheme: protectedProcedure
    .input(z.object({ theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { theme: input.theme } });
    }),

  updateSound: protectedProcedure
    .input(z.object({ soundEnabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { soundEnabled: input.soundEnabled } });
    }),

  updateFontScale: protectedProcedure
    .input(z.object({ fontScale: z.number().min(0.5).max(2.0) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { fontScale: input.fontScale } });
    }),

  ignoreList: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.ignoreEntry.findMany({
      where: { fromUserId: ctx.userId },
      include: { toUser: { select: { id: true, name: true, photoUrl: true } } },
    });
  }),

  addIgnore: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.ignoreEntry.create({
        data: { fromUserId: ctx.userId, toUserId: input.userId },
      });
    }),

  removeIgnore: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.ignoreEntry.delete({
        where: { fromUserId_toUserId: { fromUserId: ctx.userId, toUserId: input.userId } },
      });
    }),
});
