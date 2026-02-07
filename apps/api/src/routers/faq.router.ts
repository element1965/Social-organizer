import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';

// Hardcoded admin user IDs
const FAQ_ADMIN_IDS = [
  'cml9ffhhh0000o801afqv67fz', // Никита Соловей
  'cml9h2u8s000go801lcvi6ba9', // Andrei Lubalin
];

function assertAdmin(userId: string) {
  if (!FAQ_ADMIN_IDS.includes(userId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can manage FAQ' });
  }
}

export const faqRouter = router({
  list: protectedProcedure
    .input(z.object({ language: z.string().default('ru') }))
    .query(async ({ ctx, input }) => {
      return ctx.db.faqItem.findMany({
        where: { language: input.language },
        orderBy: { sortOrder: 'asc' },
      });
    }),

  isAdmin: protectedProcedure
    .query(({ ctx }) => {
      return { isAdmin: FAQ_ADMIN_IDS.includes(ctx.userId!) };
    }),

  create: protectedProcedure
    .input(z.object({
      question: z.string().min(1),
      answer: z.string().min(1),
      language: z.string().default('ru'),
      sortOrder: z.number().int().default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      return ctx.db.faqItem.create({
        data: {
          ...input,
          createdById: ctx.userId!,
        },
      });
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      question: z.string().min(1).optional(),
      answer: z.string().min(1).optional(),
      sortOrder: z.number().int().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      const { id, ...data } = input;
      return ctx.db.faqItem.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      return ctx.db.faqItem.delete({ where: { id: input.id } });
    }),
});
