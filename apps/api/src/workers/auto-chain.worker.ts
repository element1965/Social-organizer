import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  sendTelegramMessage,
  sendTelegramPhoto,
  sendTelegramVideo,
  SUPPORT_CHAT_ID,
  blockedCounter,
  MORE_BUTTON,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateBroadcastMessage } from '../services/translate.service.js';

/**
 * Every 30 minutes: process auto-chain messages.
 * For each user, check if dayOffset days have passed since registration,
 * and send messages that haven't been delivered yet.
 *
 * Send time calculation (Kyiv timezone):
 *   startOfDay(user.createdAt, Europe/Kyiv) + dayOffset days + 7:00 Kyiv + sortOrder * intervalMin minutes
 *
 * Limit: max 1 chain message per user per day (old users catch up gradually).
 */
export async function processAutoChain(_job: Job): Promise<void> {
  console.log('[Auto Chain] Worker started');
  const db = getDb();
  const now = new Date();

  try {

  // Load all active chain messages
  const messages = await db.autoChainMessage.findMany({
    where: { isActive: true },
    orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
  });
  console.log(`[Auto Chain] Messages: ${messages.length}, TZ now: ${now.toISOString()}`);
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

  // Load connected user IDs for variant filtering
  // "invited" = users with at least one confirmed connection (in someone's network)
  // "organic" = solo users with no connections (loners in clusters)
  const connections = await db.connection.findMany({
    select: { userAId: true, userBId: true },
  });
  const invitedUserIds = new Set<string>();
  for (const c of connections) {
    invitedUserIds.add(c.userAId);
    invitedUserIds.add(c.userBId);
  }

  // Load existing deliveries into Set for O(1) lookup
  const existingDeliveries = await db.autoChainDelivery.findMany({
    select: { messageId: true, userId: true },
  });
  const deliveredSet = new Set(existingDeliveries.map((d) => `${d.messageId}:${d.userId}`));

  // Load today's successful deliveries to enforce 1 message per user per day
  const nowKyivStr = now.toLocaleString('en-US', { timeZone: 'Europe/Kyiv' });
  const todayKyiv = new Date(nowKyivStr);
  todayKyiv.setHours(0, 0, 0, 0);
  // "Fake Kyiv" now — for comparing with sendTime (which is also fake Kyiv)
  const nowKyiv = new Date(nowKyivStr);
  // Convert back to UTC for DB query
  const todayUtcOffset = now.getTime() - nowKyiv.getTime();
  const todayStartUtc = new Date(todayKyiv.getTime() + todayUtcOffset);
  const todayDeliveries = await db.autoChainDelivery.findMany({
    where: { sentAt: { gte: todayStartUtc }, success: true },
    select: { userId: true },
  });
  const sentTodaySet = new Set(todayDeliveries.map((d) => d.userId));

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

    // Max 1 chain message per user per day
    if (sentTodaySet.has(acc.userId)) continue;

    for (const msg of messages) {
      const key = `${msg.id}:${acc.userId}`;
      if (deliveredSet.has(key)) continue;

      // Variant filter
      if (msg.variant === 'invited' && !invitedUserIds.has(acc.userId)) continue;
      if (msg.variant === 'organic' && invitedUserIds.has(acc.userId)) continue;

      // Calculate send time
      const sendTime = new Date(userDayStart.getTime());
      sendTime.setDate(sendTime.getDate() + msg.dayOffset);
      sendTime.setHours(7, 0, 0, 0); // 7:00 Kyiv
      sendTime.setMinutes(sendTime.getMinutes() + msg.sortOrder * msg.intervalMin);

      if (sendTime > nowKyiv) continue;

      // Translate message (cached per messageId + lang)
      const translatedText = await getTranslatedText(msg.id, msg.text, userLang);

      // Build inline buttons
      const buttons: TgReplyMarkup['inline_keyboard'] = [];
      if (msg.buttonUrl && msg.buttonText) {
        const btnText = await getTranslatedBtn(msg.id, msg.buttonText, userLang);
        buttons.push([{ text: btnText, url: msg.buttonUrl }]);
      }
      const moreText = MORE_BUTTON[userLang] || MORE_BUTTON.en!;
      buttons.push([{ text: `📖 ${moreText}`, callback_data: 'next_chain' }]);
      const markup: TgReplyMarkup = { inline_keyboard: buttons };

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
        sentTodaySet.add(acc.userId);
      }

      deliveredSet.add(key);

      // Rate limit: pause every 25 sends
      if (totalSent % 25 === 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }

      // 1 message per user per day — move to next user
      if (ok) break;
    }
  }

  const blocked = blockedCounter.count;
  console.log(`[Auto Chain] Done: sent ${totalSent}, blocked: ${blocked}, users: ${tgAccounts.length}`);
  // Always report status (for diagnostics)
  await sendTelegramMessage(
    SUPPORT_CHAT_ID,
    `🔗 <b>Auto-chain</b>: sent ${totalSent} / ${tgAccounts.length} users${blocked > 0 ? `\n🚫 Removed: ${blocked}` : ''}`,
  ).catch(() => {});

  } catch (err) {
    console.error('[Auto Chain] CRASH:', err);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `❌ <b>Auto-chain CRASH</b>: ${String(err).substring(0, 200)}`,
    ).catch(() => {});
    throw err;
  }
}
