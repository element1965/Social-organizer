import { z } from 'zod';
import { router, protectedProcedure, publicProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import { translateFaqItem } from '../services/translate.service.js';

const SUPPORTED_LANGUAGES = [
  'en', 'ru', 'es', 'fr', 'de', 'pt', 'it', 'zh', 'ja', 'ko',
  'ar', 'hi', 'tr', 'pl', 'uk', 'nl', 'sv', 'da', 'fi', 'no',
  'cs', 'ro', 'th', 'vi', 'id', 'sr',
];

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
        orderBy: { viewCount: 'desc' },
      });
    }),

  top: publicProcedure
    .input(z.object({ language: z.string().default('ru'), limit: z.number().min(1).max(20).default(5) }))
    .query(async ({ ctx, input }) => {
      let items = await ctx.db.faqItem.findMany({
        where: { language: input.language },
        orderBy: { viewCount: 'desc' },
        take: input.limit,
      });
      // Fallback to Russian if no items
      if (items.length === 0 && input.language !== 'ru') {
        items = await ctx.db.faqItem.findMany({
          where: { language: 'ru' },
          orderBy: { viewCount: 'desc' },
          take: input.limit,
        });
      }
      return items;
    }),

  all: publicProcedure
    .input(z.object({ language: z.string().default('ru') }))
    .query(async ({ ctx, input }) => {
      let items = await ctx.db.faqItem.findMany({
        where: { language: input.language },
        orderBy: { viewCount: 'desc' },
      });
      if (items.length === 0 && input.language !== 'ru') {
        items = await ctx.db.faqItem.findMany({
          where: { language: 'ru' },
          orderBy: { viewCount: 'desc' },
        });
      }
      return items;
    }),

  incrementView: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.faqItem.update({
        where: { id: input.id },
        data: { viewCount: { increment: 1 } },
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
      // If question or answer changes, reset isLocalized
      const updateData: Record<string, unknown> = { ...data };
      if (data.question !== undefined || data.answer !== undefined) {
        updateData.isLocalized = false;
      }
      return ctx.db.faqItem.update({
        where: { id },
        data: updateData,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      return ctx.db.faqItem.delete({ where: { id: input.id } });
    }),

  localizeAll: protectedProcedure
    .mutation(async ({ ctx }) => {
      assertAdmin(ctx.userId!);

      // Find all original (non-auto-translated) items that haven't been localized
      const originals = await ctx.db.faqItem.findMany({
        where: { isLocalized: false },
      });

      let translated = 0;
      for (const item of originals) {
        const groupId = item.groupId || item.id;

        if (!item.groupId) {
          await ctx.db.faqItem.update({ where: { id: item.id }, data: { groupId } });
        }

        // Delete old auto-translations for this group (but keep the original)
        await ctx.db.faqItem.deleteMany({
          where: { groupId, isLocalized: true, id: { not: item.id } },
        });

        const targetLangs = SUPPORTED_LANGUAGES.filter(l => l !== item.language);
        let created = 0;

        for (const toLang of targetLangs) {
          try {
            const result = await translateFaqItem(item.question, item.answer, item.language, toLang);
            await ctx.db.faqItem.create({
              data: {
                question: result.question,
                answer: result.answer,
                language: toLang,
                sortOrder: item.sortOrder,
                viewCount: 0,
                groupId,
                isLocalized: true,
                createdById: ctx.userId!,
              },
            });
            created++;
          } catch (err) {
            console.error(`[FAQ LocalizeAll] Failed ${item.id} -> ${toLang}:`, err);
          }
        }

        if (created > 0) {
          await ctx.db.faqItem.update({
            where: { id: item.id },
            data: { isLocalized: true },
          });
          translated++;
        }
      }

      return { success: true, translatedItems: translated, totalOriginals: originals.length };
    }),

  localize: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      const item = await ctx.db.faqItem.findUnique({ where: { id: input.id } });
      if (!item) throw new TRPCError({ code: 'NOT_FOUND', message: 'FAQ item not found' });

      const groupId = item.groupId || item.id;

      // Update source item groupId if needed
      if (!item.groupId) {
        await ctx.db.faqItem.update({ where: { id: item.id }, data: { groupId } });
      }

      // Delete old auto-translations for this group (but keep the original)
      await ctx.db.faqItem.deleteMany({
        where: { groupId, isLocalized: true, id: { not: item.id } },
      });

      const targetLangs = SUPPORTED_LANGUAGES.filter(l => l !== item.language);
      const created: string[] = [];

      for (const toLang of targetLangs) {
        try {
          const translated = await translateFaqItem(item.question, item.answer, item.language, toLang);
          await ctx.db.faqItem.create({
            data: {
              question: translated.question,
              answer: translated.answer,
              language: toLang,
              sortOrder: item.sortOrder,
              viewCount: 0,
              groupId,
              isLocalized: true,
              createdById: ctx.userId!,
            },
          });
          created.push(toLang);
        } catch (err) {
          console.error(`[FAQ Localize] Failed to translate to ${toLang}:`, err);
        }
      }

      // Mark original item as localized so the Globe icon turns green
      if (created.length > 0) {
        await ctx.db.faqItem.update({
          where: { id: item.id },
          data: { isLocalized: true },
        });
      }

      return { success: true, groupId, translatedLanguages: created };
    }),
});
