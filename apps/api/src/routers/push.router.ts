import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { VAPID_PUBLIC_KEY } from '../services/web-push.service.js';
import { apnsConfigured } from '../services/apns.service.js';
import { isAllowedPushEndpoint, MAX_PUSH_SUBSCRIPTIONS } from '../services/push-endpoint.js';

/** PostgreSQL aborted the transaction to break a deadlock (40P01), as Prisma reports it. */
function isDeadlock(err: unknown): boolean {
  const e = err as { code?: unknown; meta?: { code?: unknown }; message?: unknown } | null;
  return !!e && (e.code === 'P2034' || e.meta?.code === '40P01' || (typeof e.message === 'string' && e.message.includes('40P01')));
}

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
      // The server POSTs to this address later: only real browser push services (SEC-3)
      if (!isAllowedPushEndpoint(input.endpoint)) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported push endpoint' });
      }
      // One transaction under the endpoint lock and the account locks of the registering account and of the
      // endpoint's current owner, so the ownership check, the write and the cap cannot interleave with another
      // registration (SEC-3). Order: the endpoint first, then the account keys sorted, so two accounts swapping
      // endpoints in opposite directions queue on the same first account key instead of deadlocking.
      const register = () => ctx.db.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`push-endpoint:${input.endpoint}`}, 0))`;
        const owner = (await tx.pushSubscription.findUnique({
          where: { endpoint: input.endpoint }, select: { userId: true },
        }))?.userId;
        for (const account of [...new Set([ctx.userId, owner ?? ctx.userId])].sort()) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`push-account:${account}`}, 0))`;
        }
        // Read again under the locks: a prune or an unsubscribe of the old owner may have removed the row while
        // this waited. Nothing else can give the endpoint a new owner (that takes the endpoint lock held here),
        // so the row is now either gone or still the locked owner's.
        // An endpoint already owned by someone else may move only to the same browser subscription
        // (same keys) — e.g. another account signed in on this device. Otherwise it's a takeover (SO-14).
        const existing = await tx.pushSubscription.findUnique({ where: { endpoint: input.endpoint } });
        if (existing && existing.userId !== ctx.userId
          && (existing.p256dh !== input.p256dh || existing.auth !== input.auth)) {
          return 'taken' as const;
        }
        await tx.pushSubscription.upsert({
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
        // Keep the newest MAX_PUSH_SUBSCRIPTIONS of this account; the one just registered always stays.
        // The account is locked, so no other registration of it runs between this choice and the delete,
        // and the delete re-checks the owner, so a row another account took over meanwhile is left alone.
        await tx.$executeRaw`
          DELETE FROM push_subscriptions WHERE "userId" = ${ctx.userId} AND id IN (
            SELECT id FROM push_subscriptions WHERE "userId" = ${ctx.userId}
            ORDER BY (endpoint = ${input.endpoint}) DESC, "createdAt" DESC, id DESC
            OFFSET ${MAX_PUSH_SUBSCRIPTIONS})`;
        return 'saved' as const;
      });
      // The lock order rules out a deadlock between registrations; one with a write outside them (a delivery
      // dropping a dead endpoint) is still possible in principle, and PostgreSQL then aborts one side: run it again once
      const outcome = await register().catch((err: unknown) => {
        if (isDeadlock(err)) return register();
        throw err;
      });
      if (outcome === 'taken') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Push endpoint belongs to another user' });
      }
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
      // An iOS token is useless until the server can send through APNs: storing it would make delivery
      // pick the app over Telegram (hasPush) and the person would get nothing. The app re-registers on start.
      if (input.platform === 'ios' && !apnsConfigured()) return { success: true, stored: false };
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
