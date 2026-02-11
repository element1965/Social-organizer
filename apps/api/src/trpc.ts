import { initTRPC, TRPCError } from '@trpc/server';
import { z } from 'zod';
import type { Context } from './context.js';

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

// Pagination input schema
export const paginationInput = z.object({
  cursor: z.string().optional(),
  limit: z.number().min(1).max(100).default(20),
});
