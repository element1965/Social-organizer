import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { SKILLS_FEATURE_ENABLED } from './services/mvp-scope.js';

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const middleware = t.middleware;

// Auth middleware — ensures user is authenticated and not deleted
const isAuthed = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  // Check: deleted users cannot perform actions
  const user = await ctx.db.user.findUnique({
    where: { id: ctx.userId },
    select: { deletedAt: true },
  });
  if (user?.deletedAt) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Account has been deleted' });
  }
  // fire-and-forget — don't slow down every request
  ctx.db.user.update({
    where: { id: ctx.userId },
    data: { lastSeen: new Date() },
  }).catch(() => {});
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
