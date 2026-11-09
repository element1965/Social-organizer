import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { pickChannel } from '../services/delivery.service.js';

export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: {
        language: true, theme: true, soundEnabled: true, voiceGender: true,
        fontScale: true, hideContacts: true,
        city: true, countryCode: true, latitude: true, longitude: true,
        notifyRenewalReminder: true, notifyRenewalStart: true,
        notifyChannel: true, notifyNewCollections: true,
        platformAccounts: { where: { platform: 'TELEGRAM' }, select: { id: true }, take: 1 },
        _count: { select: { pushSubscriptions: true, nativePushTokens: true } },
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    const { platformAccounts, _count, ...rest } = user;
    const telegramLinked = platformAccounts.length > 0;
    const hasPush = _count.pushSubscriptions + _count.nativePushTokens > 0;
    return {
      ...rest,
      telegramLinked,
      hasPush,
      // The one channel events go to right now (SO-45): the person's choice or the automatic one
      effectiveChannel: pickChannel({ notifyChannel: user.notifyChannel, hasPush, telegramId: telegramLinked ? 'linked' : null }),
    };
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

  updateVoiceGender: protectedProcedure
    .input(z.object({ voiceGender: z.enum(['MALE', 'FEMALE']) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { voiceGender: input.voiceGender } });
    }),

  updateFontScale: protectedProcedure
    .input(z.object({ fontScale: z.number().min(0.5).max(2.0) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { fontScale: input.fontScale } });
    }),

  updateHideContacts: protectedProcedure
    .input(z.object({ hideContacts: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: { hideContacts: input.hideContacts } });
    }),

  updateNotifyRenewalReminder: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: { notifyRenewalReminder: input.enabled },
      });
    }),

  updateNotifyRenewalStart: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: { notifyRenewalStart: input.enabled },
      });
    }),

  /** One channel for event notifications: app push or Telegram, never both (SO-45) */
  updateNotifyChannel: protectedProcedure
    .input(z.object({ channel: z.enum(['APP', 'TELEGRAM']) }))
    .mutation(async ({ ctx, input }) => {
      if (input.channel === 'TELEGRAM') {
        const linked = await ctx.db.platformAccount.findFirst({
          where: { userId: ctx.userId, platform: 'TELEGRAM' }, select: { id: true },
        });
        if (!linked) throw new TRPCError({ code: 'PRECONDITION_FAILED', message: 'TELEGRAM_NOT_LINKED' });
      }
      await ctx.db.user.update({ where: { id: ctx.userId }, data: { notifyChannel: input.channel } });
      return { ok: true };
    }),

  /** New collections of other people; own requests and responses are not affected (SO-45) */
  updateNotifyNewCollections: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.user.update({ where: { id: ctx.userId }, data: { notifyNewCollections: input.enabled } });
      return { ok: true };
    }),

  updateGeo: protectedProcedure
    .input(z.object({
      city: z.string().max(100).optional().nullable(),
      countryCode: z.string().length(2).optional().nullable(),
      latitude: z.number().min(-90).max(90).optional().nullable(),
      longitude: z.number().min(-180).max(180).optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          city: input.city ?? undefined,
          countryCode: input.countryCode ?? undefined,
          latitude: input.latitude ?? undefined,
          longitude: input.longitude ?? undefined,
        },
      });
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
