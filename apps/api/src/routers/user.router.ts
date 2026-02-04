import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CONTACT_TYPES, CURRENCY_CODES } from '@so/shared';
import { convertToUSD } from '../services/currency.service.js';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const user = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      include: {
        platformAccounts: { select: { platform: true, platformId: true } },
      },
    });
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    return user;
  }),

  update: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      bio: z.string().max(500).optional(),
      phone: z.string().max(20).optional(),
      photoUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({ where: { id: ctx.userId }, data: input });
    }),

  getById: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.db.user.findUnique({
        where: { id: input.userId },
        select: {
          id: true, name: true, bio: true, phone: true,
          photoUrl: true, role: true, createdAt: true, deletedAt: true,
        },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      // Deleted profile - "gray": name replaced, data hidden
      if (user.deletedAt) {
        return { ...user, name: 'Deleted user', bio: null, phone: null, photoUrl: null };
      }
      return user;
    }),

  getStats: protectedProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const [connectionsCount, collectionsCount, obligationsCount] = await Promise.all([
        ctx.db.connection.count({
          where: { OR: [{ userAId: input.userId }, { userBId: input.userId }] },
        }),
        ctx.db.collection.count({ where: { creatorId: input.userId } }),
        ctx.db.obligation.count({ where: { userId: input.userId } }),
      ]);
      return { connectionsCount, collectionsCount, obligationsCount };
    }),

  getContacts: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const targetId = input.userId || ctx.userId;
      const isOwn = targetId === ctx.userId;

      const contacts = await ctx.db.userContact.findMany({
        where: { userId: targetId },
      });

      // For own profile, return all contact types (filled and empty)
      // For other profiles, return only filled contacts
      if (isOwn) {
        return CONTACT_TYPES.map(ct => ({
          type: ct.type,
          value: contacts.find(c => c.type === ct.type)?.value || '',
          label: ct.label,
          icon: ct.icon,
          placeholder: ct.placeholder,
        }));
      }
      return contacts.map(c => {
        const ct = CONTACT_TYPES.find(t => t.type === c.type);
        return {
          type: c.type,
          value: c.value,
          label: ct?.label || c.type,
          icon: ct?.icon || 'link',
        };
      });
    }),

  updateContacts: protectedProcedure
    .input(z.array(z.object({ type: z.string(), value: z.string() })))
    .mutation(async ({ ctx, input }) => {
      // Upsert each contact
      for (const { type, value } of input) {
        if (value.trim()) {
          await ctx.db.userContact.upsert({
            where: { userId_type: { userId: ctx.userId, type } },
            create: { userId: ctx.userId, type, value: value.trim() },
            update: { value: value.trim() },
          });
        } else {
          await ctx.db.userContact.deleteMany({
            where: { userId: ctx.userId, type },
          });
        }
      }
      return { success: true };
    }),

  completeOnboarding: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.user.update({
      where: { id: ctx.userId },
      data: { onboardingCompleted: true },
    });
    return { success: true };
  }),

  setPreferredCurrency: protectedProcedure
    .input(z.object({
      currency: z.string().refine((c) => CURRENCY_CODES.includes(c), 'Unsupported currency'),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: { preferredCurrency: input.currency },
      });
    }),

  setMonthlyBudget: protectedProcedure
    .input(z.object({
      amount: z.number().min(0),
      inputCurrency: z.string().refine((c) => CURRENCY_CODES.includes(c), 'Unsupported currency'),
    }))
    .mutation(async ({ ctx, input }) => {
      const amountUSD = input.inputCurrency === 'USD'
        ? input.amount
        : await convertToUSD(input.amount, input.inputCurrency);

      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: {
          monthlyBudget: amountUSD,
          remainingBudget: amountUSD,
          budgetUpdatedAt: new Date(),
        },
      });
    }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    await ctx.db.$transaction(async (tx) => {
      // 1. Clear profile (gray profile per SPEC)
      await tx.user.update({
        where: { id: ctx.userId },
        data: {
          deletedAt: new Date(),
          name: 'Deleted user',
          bio: null,
          phone: null,
          photoUrl: null,
        },
      });

      // 2. Cancel obligations in active collections
      await tx.obligation.deleteMany({
        where: {
          userId: ctx.userId,
          collection: { status: { in: ['ACTIVE', 'BLOCKED'] } },
        },
      });

      // 3. Cancel own active collections
      await tx.collection.updateMany({
        where: {
          creatorId: ctx.userId,
          status: { in: ['ACTIVE', 'BLOCKED'] },
        },
        data: { status: 'CANCELLED' },
      });
    });

    return { success: true };
  }),
});
