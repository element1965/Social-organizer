import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc.js';
import { isAdmin } from '../admin.js';
import { COMPLAINT_REASONS } from '../config/ask.js';
import {
  adminCloseReview,
  canComplain,
  castVote,
  listAdminOpenReviews,
  listMyOpenReviews,
  submitComplaint,
} from '../services/moderation.service.js';

function assertAdmin(userId: string) {
  if (!isAdmin(userId)) throw new TRPCError({ code: 'FORBIDDEN', message: 'NOT_ADMIN' });
}

export const moderationRouter = router({
  canComplain: protectedProcedure
    .input(z.object({ collectionId: z.string().min(1) }))
    .query(({ ctx, input }) => canComplain(ctx.db, ctx.userId, input.collectionId)),

  complain: protectedProcedure
    .input(z.object({
      collectionId: z.string().min(1),
      reason: z.enum(COMPLAINT_REASONS),
      comment: z.string().max(280).optional(),
    }))
    .mutation(({ ctx, input }) => submitComplaint(ctx.db, ctx.userId, input)),

  vote: protectedProcedure
    .input(z.object({
      reviewId: z.string().min(1),
      answer: z.enum(['PROBLEM', 'OK', 'UNKNOWN']),
    }))
    .mutation(({ ctx, input }) => castVote(ctx.db, ctx.userId, input)),

  myOpenReviews: protectedProcedure.query(({ ctx }) => listMyOpenReviews(ctx.db, ctx.userId)),

  adminOpenReviews: protectedProcedure.query(({ ctx }) => {
    assertAdmin(ctx.userId);
    return listAdminOpenReviews(ctx.db);
  }),

  adminClose: protectedProcedure
    .input(z.object({
      reviewId: z.string().min(1),
      outcome: z.enum(['UPHELD', 'DISMISSED']),
    }))
    .mutation(({ ctx, input }) => {
      assertAdmin(ctx.userId);
      return adminCloseReview(ctx.db, input.reviewId, input.outcome);
    }),
});
