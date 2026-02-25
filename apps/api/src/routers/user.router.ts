import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { CONTACT_TYPES, CURRENCY_CODES, validateContact } from '@so/shared';
import { convertToUSD } from '../services/currency.service.js';
import { canViewContacts } from '../services/visibility.service.js';
import { sendUserDeletedNotification } from '../services/notification.service.js';

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
      photoUrl: z.string().max(200000).optional(),
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
          remainingBudget: true, lastSeen: true,
        },
      });
      if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
      // Deleted profile - "gray": name replaced, data hidden
      if (user.deletedAt) {
        return { ...user, name: 'Deleted user', bio: null, phone: null, photoUrl: null, lastSeen: null };
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

      // Check visibility for other user's contacts
      if (!isOwn) {
        const canView = await canViewContacts(ctx.db, ctx.userId, targetId);
        if (!canView) return [];
      }

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
      // Upsert each contact (telegram is auto-managed from TG login, skip it)
      for (const { type, value } of input) {
        if (type === 'telegram') continue;
        if (value.trim() && validateContact(type, value)) continue; // skip invalid
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
    // Validate: at least 2 contacts (telegram counts)
    const relevantTypes = ['telegram', 'whatsapp', 'facebook', 'instagram', 'twitter', 'tiktok'];
    const contacts = await ctx.db.userContact.findMany({
      where: { userId: ctx.userId, type: { in: relevantTypes } },
    });
    const contactCount = contacts.filter(c => c.value.trim()).length;
    if (contactCount < 2) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: 'At least 2 contacts required' });
    }

    // Budget is optional — user can skip during onboarding

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

  updateReferralSlug: protectedProcedure
    .input(z.object({
      slug: z.string()
        .min(3, 'Minimum 3 characters')
        .max(30, 'Maximum 30 characters')
        .regex(/^[a-zA-Z0-9_-]+$/, 'Only letters, numbers, _ and -'),
    }))
    .mutation(async ({ ctx, input }) => {
      const lower = input.slug.toLowerCase();
      const existing = await ctx.db.user.findUnique({ where: { referralSlug: lower } });
      if (existing && existing.id !== ctx.userId) {
        throw new TRPCError({ code: 'CONFLICT', message: 'This slug is already taken' });
      }
      return ctx.db.user.update({
        where: { id: ctx.userId },
        data: { referralSlug: lower },
        select: { referralSlug: true },
      });
    }),

  checkRequiredInfo: protectedProcedure.query(async ({ ctx }) => {
    // Telegram counts as a contact
    const relevantTypes = ['telegram', 'whatsapp', 'facebook', 'instagram', 'twitter', 'tiktok'];
    const contacts = await ctx.db.userContact.findMany({
      where: { userId: ctx.userId, type: { in: relevantTypes } },
    });
    const contactCount = contacts.filter(c => c.value.trim()).length;
    const needsContacts = contactCount < 2;

    return { needsContacts, contactCount };
  }),

  delete: protectedProcedure.mutation(async ({ ctx }) => {
    // Capture user name and inviter before deletion
    const deletingUser = await ctx.db.user.findUnique({
      where: { id: ctx.userId },
      select: { name: true },
    });
    const inviteLink = await ctx.db.inviteLink.findFirst({
      where: { usedById: ctx.userId },
      select: { inviterId: true },
    });

    await ctx.db.$transaction(async (tx) => {
      // Check if user has any first-handshake connections
      const connectionCount = await tx.connection.count({
        where: { OR: [{ userAId: ctx.userId }, { userBId: ctx.userId }] },
      });

      // Clean up pending connections in both directions
      await tx.pendingConnection.deleteMany({
        where: {
          OR: [
            { fromUserId: ctx.userId },
            { toUserId: ctx.userId },
          ],
        },
      });

      // Cancel obligations in active collections
      await tx.obligation.deleteMany({
        where: {
          userId: ctx.userId,
          collection: { status: { in: ['ACTIVE', 'BLOCKED'] } },
        },
      });

      // Cancel own active collections
      await tx.collection.updateMany({
        where: {
          creatorId: ctx.userId,
          status: { in: ['ACTIVE', 'BLOCKED'] },
        },
        data: { status: 'CANCELLED' },
      });

      if (connectionCount === 0) {
        // No first handshake — full delete (cascade removes all related records)
        await tx.user.delete({ where: { id: ctx.userId } });
      } else {
        // Has connections — soft delete (gray profile)
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
      }
    });

    // Notify inviter that user from their first circle has been deleted
    if (inviteLink?.inviterId && deletingUser?.name) {
      sendUserDeletedNotification(ctx.db, inviteLink.inviterId, deletingUser.name)
        .catch((err) => console.error('[UserDelete] Failed to notify inviter:', err));
    }

    return { success: true };
  }),
});
