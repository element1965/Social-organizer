import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  sendTgMessages,
  SUPPORT_CHAT_ID,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateBroadcastMessage } from '../services/translate.service.js';

/**
 * Every minute: find PENDING ScheduledPosts where scheduledAt <= now,
 * atomically set status=SENT, broadcast to all TG users with translation.
 */
export async function processScheduledPost(_job: Job): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Find all posts due for sending
  const pendingPosts = await db.scheduledPost.findMany({
    where: {
      status: 'PENDING',
      scheduledAt: { lte: now },
    },
  });

  for (const post of pendingPosts) {
    // Atomically claim the post (prevent double-send)
    const updated = await db.scheduledPost.updateMany({
      where: { id: post.id, status: 'PENDING' },
      data: { status: 'SENT', sentAt: now },
    });
    if (updated.count === 0) continue; // Already claimed by another instance

    try {
      // Get all TG users
      const tgAccounts = await db.platformAccount.findMany({
        where: { platform: 'TELEGRAM' },
        select: {
          platformId: true,
          userId: true,
          user: { select: { language: true } },
        },
      });

      if (tgAccounts.length === 0) {
        await db.scheduledPost.update({
          where: { id: post.id },
          data: { sentCount: 0 },
        });
        continue;
      }

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
          translatedTexts.set(lang, await translateBroadcastMessage(post.text, lang));
        } catch {
          translatedTexts.set(lang, post.text);
        }
        if (post.buttonText) {
          try {
            translatedButtons.set(lang, await translateBroadcastMessage(post.buttonText, lang));
          } catch {
            translatedButtons.set(lang, post.buttonText);
          }
        }
      }

      function buildMarkup(lang: string): TgReplyMarkup | undefined {
        if (!post.buttonUrl || !post.buttonText) return undefined;
        const btnText = translatedButtons.get(lang) || post.buttonText;
        return { inline_keyboard: [[{ text: btnText, url: post.buttonUrl }]] };
      }

      const mediaSource = post.mediaFileId || post.mediaUrl;
      let sent = 0;

      if (post.mediaType === 'text') {
        const messages = tgAccounts.map((acc) => {
          const lang = acc.user?.language || 'en';
          return {
            telegramId: acc.platformId,
            text: translatedTexts.get(lang) || post.text,
            replyMarkup: buildMarkup(lang),
          };
        });
        await sendTgMessages(messages);
        sent = messages.length;
      } else {
        for (let i = 0; i < tgAccounts.length; i++) {
          const acc = tgAccounts[i]!;
          try {
            const lang = acc.user?.language || 'en';
            const translatedText = translatedTexts.get(lang) || post.text;
            const markup = buildMarkup(lang);
            let ok = false;
            if (post.mediaType === 'photo' && mediaSource) {
              ok = await sendTelegramPhoto(acc.platformId, mediaSource, translatedText, markup);
            } else if (post.mediaType === 'video' && mediaSource) {
              ok = await sendTelegramVideo(acc.platformId, mediaSource, translatedText, markup);
            }
            if (ok) sent++;
          } catch { /* continue */ }
          if ((i + 1) % 25 === 0) await new Promise((r) => setTimeout(r, 1100));
        }
      }

      // Record deliveries for open tracking
      const deliveryData = tgAccounts.map((acc) => ({
        postId: post.id,
        userId: acc.userId,
      }));
      if (deliveryData.length > 0) {
        await db.scheduledPostDelivery.createMany({
          data: deliveryData,
          skipDuplicates: true,
        });
      }

      await db.scheduledPost.update({
        where: { id: post.id },
        data: { sentCount: sent },
      });

      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `📢 <b>Scheduled broadcast sent</b>\n\nTo: ${tgAccounts.length} users\nDelivered: ${sent}\nMedia: ${post.mediaType}\n\n${post.text.slice(0, 200)}`,
      );

      console.log(`[Scheduled Post] ${post.id}: sent=${sent}/${tgAccounts.length}`);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      await db.scheduledPost.update({
        where: { id: post.id },
        data: { status: 'FAILED', errorMessage: errorMsg },
      });
      console.error(`[Scheduled Post] ${post.id} failed:`, errorMsg);
    }
  }
}
