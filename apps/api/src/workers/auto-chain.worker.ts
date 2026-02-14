import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  SUPPORT_CHAT_ID,
  blockedCounter,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateBroadcastMessage } from '../services/translate.service.js';

/**
 * Every 30 minutes: process auto-chain messages.
 * For each user, check if dayOffset days have passed since registration,
 * and send messages that haven't been delivered yet.
 *
 * Send time calculation (Kyiv timezone):
 *   startOfDay(user.createdAt, Europe/Kyiv) + dayOffset days + 9:00 Kyiv + sortOrder * intervalMin minutes
 *
 * Existing users get messages retroactively if their dayOffset has passed.
 */
export async function processAutoChain(_job: Job): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Load all active chain messages
  const messages = await db.autoChainMessage.findMany({
    where: { isActive: true },
    orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
  });
  if (messages.length === 0) return;

  // Load all users with TG accounts
  const tgAccounts = await db.platformAccount.findMany({
    where: { platform: 'TELEGRAM' },
    select: {
      platformId: true,
      userId: true,
      user: { select: { language: true, createdAt: true } },
    },
  });
  if (tgAccounts.length === 0) return;

  // Load existing deliveries into Set for O(1) lookup
  const existingDeliveries = await db.autoChainDelivery.findMany({
    select: { messageId: true, userId: true },
  });
  const deliveredSet = new Set(existingDeliveries.map((d) => `${d.messageId}:${d.userId}`));

  // Kyiv timezone offset helper
  function toKyivDate(date: Date): Date {
    const kyivStr = date.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
    return new Date(kyivStr);
  }

  function startOfDayKyiv(date: Date): Date {
    const kyiv = toKyivDate(date);
    kyiv.setHours(0, 0, 0, 0);
    return kyiv;
  }

  // Translation cache: messageId:lang → translated text (avoid duplicate LLM calls)
  const textCache = new Map<string, string>();
  const btnCache = new Map<string, string>();

  async function getTranslatedText(msgId: string, text: string, lang: string): Promise<string> {
    const cacheKey = `${msgId}:${lang}`;
    if (textCache.has(cacheKey)) return textCache.get(cacheKey)!;
    let translated: string;
    try {
      translated = await translateBroadcastMessage(text, lang);
    } catch {
      translated = text;
    }
    textCache.set(cacheKey, translated);
    return translated;
  }

  async function getTranslatedBtn(msgId: string, text: string, lang: string): Promise<string> {
    const cacheKey = `${msgId}:${lang}`;
    if (btnCache.has(cacheKey)) return btnCache.get(cacheKey)!;
    let translated: string;
    try {
      translated = await translateBroadcastMessage(text, lang);
    } catch {
      translated = text;
    }
    btnCache.set(cacheKey, translated);
    return translated;
  }

  let totalSent = 0;
  blockedCounter.reset();

  for (const acc of tgAccounts) {
    const userCreatedAt = acc.user?.createdAt;
    if (!userCreatedAt) continue;

    const userLang = acc.user?.language || 'en';
    const userDayStart = startOfDayKyiv(userCreatedAt);

    for (const msg of messages) {
      const key = `${msg.id}:${acc.userId}`;
      if (deliveredSet.has(key)) continue;

      // Calculate send time
      const sendTime = new Date(userDayStart.getTime());
      sendTime.setDate(sendTime.getDate() + msg.dayOffset);
      sendTime.setHours(9, 0, 0, 0); // 9:00 Kyiv
      sendTime.setMinutes(sendTime.getMinutes() + msg.sortOrder * msg.intervalMin);

      if (sendTime > now) continue;

      // Translate message (cached per messageId + lang)
      const translatedText = await getTranslatedText(msg.id, msg.text, userLang);

      // Build inline button if configured
      let markup: TgReplyMarkup | undefined;
      if (msg.buttonUrl && msg.buttonText) {
        const btnText = await getTranslatedBtn(msg.id, msg.buttonText, userLang);
        markup = { inline_keyboard: [[{ text: btnText, url: msg.buttonUrl }]] };
      }

      // Send
      const mediaSource = msg.mediaFileId || msg.mediaUrl;
      let ok = false;
      try {
        if (msg.mediaType === 'photo' && mediaSource) {
          ok = await sendTelegramPhoto(acc.platformId, mediaSource, translatedText, markup);
        } else if (msg.mediaType === 'video' && mediaSource) {
          ok = await sendTelegramVideo(acc.platformId, mediaSource, translatedText, markup);
        } else {
          ok = await sendTelegramMessage(acc.platformId, translatedText, markup);
        }
      } catch {
        ok = false;
      }

      // Record delivery
      try {
        await db.autoChainDelivery.create({
          data: {
            messageId: msg.id,
            userId: acc.userId,
            success: ok,
          },
        });
      } catch {
        // Unique constraint — already delivered
        continue;
      }

      if (ok) {
        await db.autoChainMessage.update({
          where: { id: msg.id },
          data: { sentCount: { increment: 1 } },
        });
        totalSent++;
      }

      deliveredSet.add(key);

      // Rate limit: pause every 25 sends
      if (totalSent % 25 === 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }
  }

  if (totalSent > 0) {
    const blocked = blockedCounter.count;
    console.log(`[Auto Chain] Sent ${totalSent} messages, blocked: ${blocked}`);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `🔗 <b>Auto-chain</b>: sent ${totalSent} messages${blocked > 0 ? `\n🚫 Removed: ${blocked} (blocked bot)` : ''}`,
    );
  }
}
