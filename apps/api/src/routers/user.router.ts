import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { isDataUrl, storeAvatar } from '../services/avatar.service.js';
import { TRPCError } from '@trpc/server';
import { CONTACT_TYPES, CONTACT_TYPE_IDS, MAX_CONTACT_VALUE_LENGTH, hasForeignScheme, CURRENCY_CODES, MIN_OBLIGATION_AMOUNT, contactValueAllowed } from '@so/shared';
import { canViewContacts } from '../services/visibility.service.js';
import { deleteUserAccount } from '../services/account-deletion.service.js';

export const userRouter = router({
  me: protectedProcedure.query(async ({ ctx }) => {
    const [user, contactCount] = await Promise.all([
      ctx.db.user.findUnique({
        where: { id: ctx.userId },
        include: {
          platformAccounts: { select: { platform: true, platformId: true } },
        },
      }),
      ctx.db.userContact.count({
        where: { userId: ctx.userId, value: { not: '' } },
      }),
    ]);
    if (!user) throw new TRPCError({ code: 'NOT_FOUND' });
    // Never send the password hash or exact coordinates to the client (SO-14)
    const { passwordHash: _hash, latitude: _lat, longitude: _lon, ...safe } = user;
    return { ...safe, contactCount };
  }),

  update: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100).optional(),
      bio: z.string().max(500).optional(),
      phone: z.string().max(20).optional(),
      photoUrl: z.string().max(200000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const data = { ...input };
      // An uploaded photo (data URL) is stored apart; the profile keeps its short address
      if (isDataUrl(data.photoUrl)) {
        const stored = await storeAvatar(ctx.db, ctx.userId, data.photoUrl);
        if (!stored) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Unsupported photo' });
        data.photoUrl = stored;
      }
      return ctx.db.user.update({ where: { id: ctx.userId }, data });
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
      // Phone follows the same visibility rule as the contacts list (SO-14)
      if (user.phone && !(await canViewContacts(ctx.db, ctx.userId, user.id))) {
        return { ...user, phone: null };
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
        const me = await ctx.db.user.findUnique({
          where: { id: ctx.userId },
          select: { platformAccounts: { where: { platform: 'TELEGRAM' }, select: { id: true } } },
        });
        // The sign-in e-mail stays private: it becomes a contact only when the person switches
        // "Show my e-mail in contacts" on (Account page). It used to be copied here silently.
        // Telegram is filled automatically only for Telegram sign-in; others type it themselves
        const telegramLocked = (me?.platformAccounts.length ?? 0) > 0;
        return CONTACT_TYPES.map(ct => ({
          type: ct.type,
          value: contacts.find(c => c.type === ct.type)?.value || '',
          label: ct.label,
          icon: ct.icon,
          placeholder: ct.placeholder,
          locked: ct.type === 'telegram' && telegramLocked,
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
    .input(z.array(z.object({
      type: z.enum(CONTACT_TYPE_IDS),
      // Empty value = delete the contact; anything else must not carry a non-http(s) scheme
      value: z.string().trim().max(MAX_CONTACT_VALUE_LENGTH),
    }).refine(
      // Legacy 'mailto:' e-mails stay valid; every other non-http(s) scheme (javascript:, data:, ...) is rejected
      (c) => !hasForeignScheme(c.value) || (c.type === 'email' && /^mailto:/i.test(c.value)),
      { message: 'Invalid contact value', path: ['value'] },
    )).max(CONTACT_TYPE_IDS.length))
    .mutation(async ({ ctx, input }) => {
      // Telegram is auto-managed for Telegram sign-in; other users may set it themselves
      const hasTelegramLogin = (await ctx.db.platformAccount.count({
        where: { userId: ctx.userId, platform: 'TELEGRAM' },
      })) > 0;
      for (const item of input) {
        const type = item.type;
        const value = item.value.trim();
        if (type === 'telegram' && hasTelegramLogin) continue;
        if (value && !contactValueAllowed(type, value)) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVALID_CONTACT' });
        }
        if (value) {
          await ctx.db.userContact.upsert({
            where: { userId_type: { userId: ctx.userId, type } },
            create: { userId: ctx.userId, type, value },
            update: { value },
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
      amount: z.number().int().min(0), // whole $ only: 1 $ = 1 unit
      inputCurrency: z.literal('USD').default('USD'), // amounts are in $ only: 1 $ = 1 unit, no conversion (SO-40)
    }))
    .mutation(async ({ ctx, input }) => {
      const amountUSD = input.amount;
      // 0 means "no capacity right now"; any other value must be at least 1 $.
      if (amountUSD > 0 && amountUSD < MIN_OBLIGATION_AMOUNT) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'MIN_AMOUNT_USD' });
      }

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
    await deleteUserAccount(ctx.db, ctx.userId);
    return { success: true };
  }),
});
