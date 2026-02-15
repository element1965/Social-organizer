import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  sendTgMessages,
  SUPPORT_CHAT_ID,
  blockedCounter,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateBroadcastMessage } from '../services/translate.service.js';
import { ADMIN_IDS } from '../admin.js';

function assertAdmin(userId: string) {
  if (!ADMIN_IDS.includes(userId)) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Only admins can send broadcasts' });
  }
}

export const broadcastRouter = router({
  sendAll: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      mediaType: z.enum(['text', 'photo', 'video']).default('text'),
      mediaUrl: z.string().optional(),
      mediaFileId: z.string().optional(),
      buttonUrl: z.string().optional(),
      buttonText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      // Get all users with TG accounts + their language
      const tgAccounts = await ctx.db.platformAccount.findMany({
        where: { platform: 'TELEGRAM' },
        select: {
          platformId: true,
          user: { select: { language: true, name: true } },
        },
      });

      if (tgAccounts.length === 0) return { sent: 0 };

      // Group by language, translate once per language
      const byLang = new Map<string, typeof tgAccounts>();
      for (const acc of tgAccounts) {
        const lang = acc.user?.language || 'en';
        if (!byLang.has(lang)) byLang.set(lang, []);
        byLang.get(lang)!.push(acc);
      }

      const translatedTexts = new Map<string, string>();
      const translatedButtons = new Map<string, string>();
      for (const lang of byLang.keys()) {
        try {
          translatedTexts.set(lang, await translateBroadcastMessage(input.text, lang));
        } catch {
          translatedTexts.set(lang, input.text);
        }
        if (input.buttonText) {
          try {
            translatedButtons.set(lang, await translateBroadcastMessage(input.buttonText, lang));
          } catch {
            translatedButtons.set(lang, input.buttonText);
          }
        }
      }

      function buildMarkup(lang: string): TgReplyMarkup | undefined {
        if (!input.buttonUrl || !input.buttonText) return undefined;
        const btnText = translatedButtons.get(lang) || input.buttonText;
        return { inline_keyboard: [[{ text: btnText, url: input.buttonUrl }]] };
      }

      // Media source: uploaded file_id takes priority over URL
      const mediaSource = input.mediaFileId || input.mediaUrl;

      let sent = 0;
      blockedCounter.reset();

      if (input.mediaType === 'text') {
        const messages = tgAccounts.map((acc) => {
          const lang = acc.user?.language || 'en';
          return {
            telegramId: acc.platformId,
            text: translatedTexts.get(lang) || input.text,
            replyMarkup: buildMarkup(lang),
          };
        });
        await sendTgMessages(messages);
        sent = messages.length;
      } else {
        // Photo/video: send individually with delay to avoid rate-limiting
        for (let i = 0; i < tgAccounts.length; i++) {
          const acc = tgAccounts[i]!;
          try {
            const lang = acc.user?.language || 'en';
            const translatedText = translatedTexts.get(lang) || input.text;
            const markup = buildMarkup(lang);
            let ok = false;
            if (input.mediaType === 'photo' && mediaSource) {
              ok = await sendTelegramPhoto(acc.platformId, mediaSource, translatedText, markup);
            } else if (input.mediaType === 'video' && mediaSource) {
              ok = await sendTelegramVideo(acc.platformId, mediaSource, translatedText, markup);
            }
            if (ok) sent++;
          } catch { /* continue */ }
          // Delay every 25 messages to respect Telegram rate limits
          if ((i + 1) % 25 === 0) await new Promise((r) => setTimeout(r, 1100));
        }
      }

      // Confirm in support chat
      const blocked = blockedCounter.count;
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `📢 <b>Broadcast sent</b>\n\nTo: ${tgAccounts.length} users\nDelivered: ${sent}\nMedia: ${input.mediaType}${blocked > 0 ? `\n🚫 Removed: ${blocked} (blocked bot)` : ''}\n\n${input.text.slice(0, 200)}`,
      );

      return { sent };
    }),

  sendDirect: protectedProcedure
    .input(z.object({
      telegramId: z.string().min(1),
      text: z.string().min(1).max(4000),
      mediaType: z.enum(['text', 'photo', 'video']).default('text'),
      mediaUrl: z.string().optional(),
      mediaFileId: z.string().optional(),
      buttonUrl: z.string().optional(),
      buttonText: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      // Find user by telegram account
      const account = await ctx.db.platformAccount.findFirst({
        where: { platform: 'TELEGRAM', platformId: input.telegramId },
        select: { user: { select: { language: true, name: true } } },
      });

      const lang = account?.user?.language || 'en';
      const userName = account?.user?.name || 'Unknown';

      let translatedText: string;
      try {
        translatedText = await translateBroadcastMessage(input.text, lang);
      } catch {
        translatedText = input.text;
      }

      let markup: TgReplyMarkup | undefined;
      if (input.buttonUrl && input.buttonText) {
        let btnText: string;
        try {
          btnText = await translateBroadcastMessage(input.buttonText, lang);
        } catch {
          btnText = input.buttonText;
        }
        markup = { inline_keyboard: [[{ text: btnText, url: input.buttonUrl }]] };
      }

      const mediaSource = input.mediaFileId || input.mediaUrl;
      let ok = false;
      if (input.mediaType === 'photo' && mediaSource) {
        ok = await sendTelegramPhoto(input.telegramId, mediaSource, translatedText, markup);
      } else if (input.mediaType === 'video' && mediaSource) {
        ok = await sendTelegramVideo(input.telegramId, mediaSource, translatedText, markup);
      } else {
        ok = await sendTelegramMessage(input.telegramId, translatedText, markup);
      }

      // Duplicate to support chat
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `📨 <b>Reply to ${userName} [${input.telegramId}]</b>\n\n${translatedText}`,
      );

      return { success: ok };
    }),

  // --- Scheduled Posts ---

  schedulePost: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      mediaType: z.enum(['text', 'photo', 'video']).default('text'),
      mediaUrl: z.string().optional(),
      mediaFileId: z.string().optional(),
      buttonUrl: z.string().optional(),
      buttonText: z.string().optional(),
      scheduledAt: z.string().transform((s) => new Date(s)),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      const minTime = new Date(Date.now() + 60 * 1000); // at least 1 min from now
      if (input.scheduledAt < minTime) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'scheduledAt must be at least 1 minute from now' });
      }

      const post = await ctx.db.scheduledPost.create({
        data: {
          text: input.text,
          mediaType: input.mediaType,
          mediaUrl: input.mediaUrl,
          mediaFileId: input.mediaFileId,
          buttonUrl: input.buttonUrl,
          buttonText: input.buttonText,
          scheduledAt: input.scheduledAt,
          createdById: ctx.userId!,
        },
      });
      return post;
    }),

  listScheduled: protectedProcedure
    .input(z.object({
      status: z.enum(['PENDING', 'SENT', 'CANCELLED', 'FAILED']).optional(),
    }).optional())
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      return ctx.db.scheduledPost.findMany({
        where: input?.status ? { status: input.status } : undefined,
        orderBy: { scheduledAt: 'desc' },
        include: {
          _count: { select: { deliveries: true } },
          deliveries: {
            where: { readAt: { not: null } },
            select: { id: true },
          },
        },
      });
    }),

  cancelScheduled: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      const post = await ctx.db.scheduledPost.findUnique({ where: { id: input.id } });
      if (!post) throw new TRPCError({ code: 'NOT_FOUND' });
      if (post.status !== 'PENDING') {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Can only cancel PENDING posts' });
      }

      return ctx.db.scheduledPost.update({
        where: { id: input.id },
        data: { status: 'CANCELLED' },
      });
    }),

  scheduledStats: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);

      const post = await ctx.db.scheduledPost.findUnique({
        where: { id: input.id },
        include: {
          _count: { select: { deliveries: true } },
        },
      });
      if (!post) throw new TRPCError({ code: 'NOT_FOUND' });

      const readCount = await ctx.db.scheduledPostDelivery.count({
        where: { postId: input.id, readAt: { not: null } },
      });

      return {
        sentCount: post.sentCount ?? 0,
        deliveredCount: post._count.deliveries,
        readCount,
        openRate: post._count.deliveries > 0
          ? Math.round((readCount / post._count.deliveries) * 100)
          : 0,
      };
    }),

  // --- Auto-Chain Messages ---

  createChainMessage: protectedProcedure
    .input(z.object({
      text: z.string().min(1).max(4000),
      mediaType: z.enum(['text', 'photo', 'video']).default('text'),
      mediaUrl: z.string().optional(),
      mediaFileId: z.string().optional(),
      buttonUrl: z.string().optional(),
      buttonText: z.string().optional(),
      dayOffset: z.number().int().min(0),
      sortOrder: z.number().int().min(0).default(0),
      intervalMin: z.number().int().min(1).default(120),
      variant: z.enum(['all', 'invited', 'organic']).default('all'),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      return ctx.db.autoChainMessage.create({ data: input });
    }),

  listChainMessages: protectedProcedure
    .query(async ({ ctx }) => {
      assertAdmin(ctx.userId!);

      return ctx.db.autoChainMessage.findMany({
        orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
        include: {
          _count: { select: { deliveries: true } },
          deliveries: {
            where: { readAt: { not: null } },
            select: { id: true },
          },
        },
      });
    }),

  updateChainMessage: protectedProcedure
    .input(z.object({
      id: z.string(),
      text: z.string().min(1).max(4000).optional(),
      mediaType: z.enum(['text', 'photo', 'video']).optional(),
      mediaUrl: z.string().nullable().optional(),
      mediaFileId: z.string().nullable().optional(),
      buttonUrl: z.string().nullable().optional(),
      buttonText: z.string().nullable().optional(),
      dayOffset: z.number().int().min(0).optional(),
      sortOrder: z.number().int().min(0).optional(),
      intervalMin: z.number().int().min(1).optional(),
      variant: z.enum(['all', 'invited', 'organic']).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      const { id, ...data } = input;
      return ctx.db.autoChainMessage.update({ where: { id }, data });
    }),

  deleteChainMessage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      assertAdmin(ctx.userId!);
      return ctx.db.autoChainMessage.delete({ where: { id: input.id } });
    }),

  chainStats: protectedProcedure
    .query(async ({ ctx }) => {
      assertAdmin(ctx.userId!);

      const messages = await ctx.db.autoChainMessage.findMany({
        select: {
          id: true,
          isActive: true,
          sentCount: true,
          _count: { select: { deliveries: true } },
        },
      });

      const totalDeliveries = await ctx.db.autoChainDelivery.count();
      const totalRead = await ctx.db.autoChainDelivery.count({
        where: { readAt: { not: null } },
      });

      return {
        totalMessages: messages.length,
        activeMessages: messages.filter((m) => m.isActive).length,
        totalDeliveries,
        totalRead,
        openRate: totalDeliveries > 0 ? Math.round((totalRead / totalDeliveries) * 100) : 0,
      };
    }),

  // --- Mark deliveries as read (called when user opens app) ---
  markRead: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.userId;
      if (!userId) return { marked: 0 };

      const now = new Date();

      const [sp, ac] = await Promise.all([
        ctx.db.scheduledPostDelivery.updateMany({
          where: { userId, readAt: null },
          data: { readAt: now },
        }),
        ctx.db.autoChainDelivery.updateMany({
          where: { userId, readAt: null },
          data: { readAt: now },
        }),
      ]);

      return { marked: sp.count + ac.count };
    }),
});
