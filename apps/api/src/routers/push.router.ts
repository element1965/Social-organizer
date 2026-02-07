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
});
