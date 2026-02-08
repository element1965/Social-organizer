import { z } from 'zod';
import { router, protectedProcedure } from '../trpc.js';
import { TRPCError } from '@trpc/server';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  sendTgMessages,
  SUPPORT_CHAT_ID,
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
      for (const lang of byLang.keys()) {
        try {
          translatedTexts.set(lang, await translateBroadcastMessage(input.text, lang));
        } catch {
          translatedTexts.set(lang, input.text);
        }
      }

      // Build inline button if provided
      const replyMarkup: TgReplyMarkup | undefined =
        input.buttonUrl && input.buttonText
          ? { inline_keyboard: [[{ text: input.buttonText, url: input.buttonUrl }]] }
          : undefined;

      // Media source: uploaded file_id takes priority over URL
      const mediaSource = input.mediaFileId || input.mediaUrl;

      let sent = 0;

      if (input.mediaType === 'text') {
        const messages = tgAccounts.map((acc) => {
          const lang = acc.user?.language || 'en';
          return {
            telegramId: acc.platformId,
            text: translatedTexts.get(lang) || input.text,
            replyMarkup,
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
            let ok = false;
            if (input.mediaType === 'photo' && mediaSource) {
              ok = await sendTelegramPhoto(acc.platformId, mediaSource, translatedText, replyMarkup);
            } else if (input.mediaType === 'video' && mediaSource) {
              ok = await sendTelegramVideo(acc.platformId, mediaSource, translatedText, replyMarkup);
            }
            if (ok) sent++;
          } catch { /* continue */ }
          // Delay every 25 messages to respect Telegram rate limits
          if ((i + 1) % 25 === 0) await new Promise((r) => setTimeout(r, 1100));
        }
      }

      // Confirm in support chat
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `📢 <b>Broadcast sent</b>\n\nTo: ${tgAccounts.length} users\nDelivered: ${sent}\nMedia: ${input.mediaType}\n\n${input.text.slice(0, 200)}`,
      );

      return { sent };
    }),

  sendDirect: protectedProcedure
    .input(z.object({
      telegramId: z.string().min(1),
      text: z.string().min(1).max(4000),
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

      const ok = await sendTelegramMessage(input.telegramId, translatedText);

      // Duplicate to support chat
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `📨 <b>Reply to ${userName} [${input.telegramId}]</b>\n\n${translatedText}`,
      );

      return { success: ok };
    }),
});
