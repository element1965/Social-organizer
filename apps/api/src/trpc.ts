import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { SKILLS_FEATURE_ENABLED } from './services/mvp-scope.js';

const t = initTRPC.context<Context>().create({
  // Additive error data, so older clients keep working: ACCOUNT_EXISTS_OTHER_METHOD carries the masked e-mail
  // of the existing account ("an•••@gmail.com") for the account-linking screen. Never the full address.
  errorFormatter({ shape, error }) {
    const cause = error.cause as { maskedEmail?: unknown } | undefined;
    const maskedEmail = typeof cause?.maskedEmail === 'string' ? cause.maskedEmail : undefined;
    return maskedEmail ? { ...shape, data: { ...shape.data, maskedEmail } } : shape;
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

const LAST_SEEN_THROTTLE_MS = 60 * 1000;

// Auth middleware — ensures user is authenticated and not deleted
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  // Check: deleted users cannot perform actions
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { deletedAt: true, lastSeen: true, inactivityStage: true },
  });
  if (user?.deletedAt) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Account has been deleted' });
  }
  // Activity heartbeat: lastSeen drives "online" display and the 2-year inactivity cleanup.
  // Throttled to one write per minute; any activity also cancels pending inactivity warnings.
  // Fire-and-forget — don't slow down every request.
  if (user) {
    const now = new Date();
    const stale = !user.lastSeen || now.getTime() - user.lastSeen.getTime() > LAST_SEEN_THROTTLE_MS;
    if (stale || user.inactivityStage > 0) {
      ctx.db.user.update({
        where: { id: ctx.userId },
        data: user.inactivityStage > 0
          ? { lastSeen: now, inactivityStage: 0, inactivityWarnedAt: null }
          : { lastSeen: now },
      }).catch(() => {});
    }
  }
  return next({ ctx: { ...ctx, userId: ctx.userId } });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// Skills, needs, matching and exchange chains are outside the money MVP.
// Their API answers NOT_FOUND unless FEATURE_SKILLS=true. Data stays in the DB.
const skillsFeatureGate = middleware(async ({ next }) => {
  if (!SKILLS_FEATURE_ENABLED) {
    throw new TRPCError({ code: 'NOT_FOUND', message: 'FEATURE_DISABLED' });
  }
  return next();
});

export const skillsProcedure = protectedProcedure.use(skillsFeatureGate);

// Pagination input schema
export const paginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
});
