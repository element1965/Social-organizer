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
import { translateWithCache } from '../services/translate.service.js';
import { sendWebPush } from '../services/web-push.service.js';
import { isRetiredChainMessage } from '../services/mvp-scope.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

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
  // Skills reminders and messages leading to retired screens are not sent in the MVP
  const messages = (await db.autoChainMessage.findMany({
    where: { isActive: true },
    orderBy: [{ dayOffset: 'asc' }, { sortOrder: 'asc' }],
  })).filter((m) => !isRetiredChainMessage(m));
  console.log(`[Auto Chain] Messages: ${messages.length}, TZ now: ${now.toISOString()}`);
  if (messages.length === 0) return;

  // Load all users with TG accounts
  const tgAccounts = await db.platformAccount.findMany({
    where: { platform: 'TELEGRAM' },
    select: {
      platformId: true,
      userId: true,
      user: { select: { language: true, createdAt: true, skillsCompleted: true } },
    },
  });

  // Load non-TG users with push subscriptions (Android app users)
  const tgUserIds = new Set(tgAccounts.map((a) => a.userId));
  const pushUsers = await db.pushSubscription.findMany({
    where: { userId: { notIn: [...tgUserIds] } },
    select: { userId: true },
    distinct: ['userId'],
  });
  const pushOnlyUsers = pushUsers.length > 0
    ? await db.user.findMany({
        where: { id: { in: pushUsers.map((p) => p.userId) }, deletedAt: null },
        select: { id: true, language: true, createdAt: true, skillsCompleted: true },
      })
    : [];

  if (tgAccounts.length === 0 && pushOnlyUsers.length === 0) return;

  // Load connected user IDs for variant filtering
  // "invited" = users with at least one confirmed connection OR pending connection
  // "organic" = solo users with no connections at all
  const connections = await db.connection.findMany({
    select: { userAId: true, userBId: true },
  });
  const pendingConns = await db.pendingConnection.findMany({
    where: { status: 'PENDING' },
    select: { fromUserId: true, toUserId: true },
  });
  const invitedUserIds = new Set<string>();
  for (const c of connections) {
    invitedUserIds.add(c.userAId);
    invitedUserIds.add(c.userBId);
  }
  for (const p of pendingConns) {
    invitedUserIds.add(p.fromUserId);
    invitedUserIds.add(p.toUserId);
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

      // Skip skills reminder messages (sortOrder >= 100) for users who already filled skills
      if (msg.sortOrder >= 100 && acc.user?.skillsCompleted) continue;

      // Calculate send time
      const sendTime = new Date(userDayStart.getTime());
      sendTime.setDate(sendTime.getDate() + msg.dayOffset);
      sendTime.setHours(7, 0, 0, 0); // 7:00 Kyiv
      sendTime.setMinutes(sendTime.getMinutes() + msg.sortOrder * msg.intervalMin);

      if (sendTime > nowKyiv) continue;

      // Translate message (DB-cached)
      const translatedText = await translateWithCache(msg.text, userLang).catch(() => msg.text);

      // Build inline buttons
      const buttons: TgReplyMarkup['inline_keyboard'] = [];
      if (msg.buttonUrl && msg.buttonText) {
        const btnText = await translateWithCache(msg.buttonText, userLang).catch(() => msg.buttonText!);
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
        // No extra Web Push copy: the message already reached the person in Telegram (one channel, SO-45)
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

  // Process push-only users (Android app without TG)
  let pushSent = 0;
  for (const user of pushOnlyUsers) {
    if (!user.createdAt) continue;
    if (sentTodaySet.has(user.id)) continue;

    const userLang = user.language || 'en';
    const userDayStart = startOfDayKyiv(user.createdAt);

    for (const msg of messages) {
      const key = `${msg.id}:${user.id}`;
      if (deliveredSet.has(key)) continue;

      if (msg.variant === 'invited' && !invitedUserIds.has(user.id)) continue;
      if (msg.variant === 'organic' && invitedUserIds.has(user.id)) continue;
      if (msg.sortOrder >= 100 && user.skillsCompleted) continue;

      const sendTime = new Date(userDayStart.getTime());
      sendTime.setDate(sendTime.getDate() + msg.dayOffset);
      sendTime.setHours(7, 0, 0, 0);
      sendTime.setMinutes(sendTime.getMinutes() + msg.sortOrder * msg.intervalMin);
      if (sendTime > nowKyiv) continue;

      const translatedText = await translateWithCache(msg.text, userLang).catch(() => msg.text);

      // Send via Web Push only
      try {
        await sendWebPush(db, [user.id], {
          title: 'Social Organizer',
          body: translatedText.replace(/<[^>]+>/g, '').slice(0, 100),
          url: `${WEB_APP_URL}/dashboard`,
        });
      } catch { /* skip */ }

      // Record delivery
      try {
        await db.autoChainDelivery.create({
          data: { messageId: msg.id, userId: user.id, success: true },
        });
      } catch { continue; }

      await db.autoChainMessage.update({
        where: { id: msg.id },
        data: { sentCount: { increment: 1 } },
      });
      pushSent++;
      sentTodaySet.add(user.id);
      deliveredSet.add(key);
      break; // 1 per day
    }
  }

  const blocked = blockedCounter.count;
  const removedDetails = blockedCounter.removed.map((u) => {
    const contacts = u.contacts.map((c) => `${c.type}: ${c.value}`).join(', ');
    return `• ${u.name} (TG: ${u.platformId}${contacts ? `, ${contacts}` : ''})`;
  }).join('\n');
  const totalUsers = tgAccounts.length + pushOnlyUsers.length;
  console.log(`[Auto Chain] Done: sent ${totalSent} TG + ${pushSent} Push, blocked: ${blocked}, users: ${totalUsers}`);
  // Always report status (for diagnostics)
  await sendTelegramMessage(
    SUPPORT_CHAT_ID,
    `🔗 <b>Авто-цепочка</b>: TG ${totalSent}, Push ${pushSent} из ${totalUsers} пользователей${blocked > 0 ? `\n🚫 Удалено: ${blocked}\n${removedDetails}` : ''}`,
  ).catch(() => {});

  } catch (err) {
    console.error('[Auto Chain] CRASH:', err);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `❌ <b>Ошибка авто-цепочки</b>: ${String(err).substring(0, 200)}`,
    ).catch(() => {});
    throw err;
  }
}
