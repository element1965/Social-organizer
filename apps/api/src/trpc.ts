import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';
import { SKILLS_FEATURE_ENABLED } from './services/mvp-scope.js';
import { touchUser } from './services/activity.service.js';

const t = initTRPC.context<Context>().create({
  // Additive error data, so older clients keep working: ACCOUNT_EXISTS_OTHER_METHOD carries the masked e-mail
  // of the existing account ("an•••@gmail.com") for the account-linking screen. Never the full address.
  // An input that fails the procedure's schema (BAD_REQUEST caused by a ZodError) carries `invalidFields`: the
  // top-level input fields at fault ("chatLink"), so the client can say which field to check instead of
  // treating it as a refusal of the current state. Field names only, never values or messages.
  errorFormatter({ shape, error }) {
    const cause = error.cause as { maskedEmail?: unknown } | undefined;
    const maskedEmail = typeof cause?.maskedEmail === 'string' ? cause.maskedEmail : undefined;
    const invalidFields = error.code === 'BAD_REQUEST' && error.cause instanceof z.ZodError
      ? [...new Set(error.cause.issues.map((issue) => String(issue.path[0] ?? '')).filter(Boolean))]
      : undefined;
    if (!maskedEmail && !invalidFields) return shape;
    return {
      ...shape,
      data: { ...shape.data, ...(maskedEmail ? { maskedEmail } : {}), ...(invalidFields ? { invalidFields } : {}) },
    };
  },
});

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
  // A valid token for an account that no longer exists (hard-deleted, auto-deleted, or a reset local database):
  // UNAUTHORIZED makes every client sign out instead of retrying forever on NOT_FOUND.
  if (!user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Account not found' });
  }
  if (user.deletedAt) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Account has been deleted' });
  }
  // Activity heartbeat (lastSeen + inactivity stage reset), throttled and fire-and-forget
  touchUser(ctx.db, ctx.userId);
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
