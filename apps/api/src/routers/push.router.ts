import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { VAPID_PUBLIC_KEY } from '../services/web-push.service.js';

export const pushRouter = router({
  vapidPublicKey: publicProcedure.query(() => {
    return { key: VAPID_PUBLIC_KEY };
  }),

  subscribe: protectedProcedure
    .input(z.object({
      endpoint: z.string().url(),
      p256dh: z.string(),
      auth: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.upsert({
        where: { endpoint: input.endpoint },
        create: {
          userId: ctx.userId,
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
        },
        update: {
          userId: ctx.userId,
          p256dh: input.p256dh,
          auth: input.auth,
        },
      });
      return { success: true };
    }),

  unsubscribe: protectedProcedure
    .input(z.object({
      endpoint: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.pushSubscription.deleteMany({
        where: { endpoint: input.endpoint, userId: ctx.userId },
      });
      return { success: true };
    }),

  registerNativeToken: protectedProcedure
    .input(z.object({
      token: z.string().min(1),
      platform: z.string().default('android'),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.nativePushToken.upsert({
        where: { token: input.token },
        create: {
          userId: ctx.userId,
          token: input.token,
          platform: input.platform,
        },
        update: {
          userId: ctx.userId,
          platform: input.platform,
        },
      });
      return { success: true };
    }),

  unregisterNativeToken: protectedProcedure
    .input(z.object({
      token: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.nativePushToken.deleteMany({
        where: { token: input.token, userId: ctx.userId },
      });
      return { success: true };
    }),
});
