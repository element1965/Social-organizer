import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  sendTelegramMessage,
  SUPPORT_CHAT_ID,
  ONBOARDING_REMINDERS,
  BOT_START_REMINDERS,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateWithCache } from '../services/translate.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/** Timing thresholds (in milliseconds) for each reminder level */
const TIMING_MS = [
  1 * 60 * 60 * 1000,      // level 1: 1 hour
  24 * 60 * 60 * 1000,     // level 2: 24 hours
  72 * 60 * 60 * 1000,     // level 3: 72 hours
];

/**
 * Onboarding Reminder Worker — runs every hour.
 *
 * Two audiences:
 * 1. BotStart — pressed /start but never opened the app (no PlatformAccount)
 * 2. Users — opened the app but didn't complete onboarding (onboardingCompleted: false)
 */
export async function processOnboardingReminder(_job: Job): Promise<void> {
  console.log('[Onboarding Reminder] Worker started');
  const db = getDb();
  const now = new Date();

  try {
    let totalSent = 0;

    // ─── Part 1: BotStart reminders (never opened the app) ───
    const botStarts = await db.botStart.findMany({
      where: { reminderSent: { lt: 3 } },
    });

    let botStartSent = 0;
    let botStartCleaned = 0;
    const botStartByLevel: Record<number, string[]> = { 0: [], 1: [], 2: [] };

    for (const bs of botStarts) {
      // Check if user has since created an account — if so, clean up
      const hasAccount = await db.platformAccount.findFirst({
        where: { platform: 'TELEGRAM', platformId: bs.chatId },
        select: { id: true },
      });
      if (hasAccount) {
        await db.botStart.delete({ where: { id: bs.id } });
        botStartCleaned++;
        continue;
      }

      const level = bs.reminderSent;
      const timingThreshold = TIMING_MS[level];
      if (!timingThreshold) continue;

      const elapsed = now.getTime() - bs.createdAt.getTime();
      if (elapsed < timingThreshold) continue;

      const reminder = BOT_START_REMINDERS[level];
      if (!reminder) continue;

      // Look up inviter name from invite token
      let inviterName = '';
      if (bs.inviteToken) {
        const invite = await db.inviteLink.findUnique({
          where: { token: bs.inviteToken },
          select: { inviter: { select: { name: true } } },
        });
        if (invite?.inviter?.name) {
          inviterName = invite.inviter.name;
        }
      }

      const baseText = reminder.text.replace('{inviterName}', inviterName || 'Social Organizer');
      const userLang = bs.language || 'en';
      const [text, buttonText] = await Promise.all([
        translateWithCache(baseText, userLang).catch(() => baseText),
        translateWithCache(reminder.buttonText, userLang).catch(() => reminder.buttonText as string),
      ]);

      // Build web_app URL — include invite token if available
      const appUrl = bs.inviteToken
        ? `${WEB_APP_URL}/invite/${bs.inviteToken}`
        : WEB_APP_URL;

      const markup: TgReplyMarkup = {
        inline_keyboard: [[{ text: `📱 ${buttonText}`, web_app: { url: appUrl } }]],
      };

      const ok = await sendTelegramMessage(bs.chatId, text, markup);

      if (ok) {
        await db.botStart.update({
          where: { id: bs.id },
          data: { reminderSent: level + 1 },
        });
        botStartByLevel[level]?.push(bs.chatId);
        botStartSent++;
        totalSent++;
      }

      if (totalSent % 25 === 0 && totalSent > 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    // ─── Part 2: Onboarding reminders (opened app, didn't finish) ───
    const users = await db.user.findMany({
      where: {
        onboardingCompleted: false,
        deletedAt: null,
        onboardingReminderSent: { lt: 3 },
        platformAccounts: { some: { platform: 'TELEGRAM' } },
      },
      select: {
        id: true,
        name: true,
        language: true,
        createdAt: true,
        onboardingReminderSent: true,
        platformAccounts: {
          where: { platform: 'TELEGRAM' },
          select: { platformId: true },
        },
      },
    });

    let onboardingSent = 0;
    const onboardingByLevel: Record<number, string[]> = { 0: [], 1: [], 2: [] };

    for (const user of users) {
      const tgAccount = user.platformAccounts[0];
      if (!tgAccount) continue;

      const level = user.onboardingReminderSent;
      const timingThreshold = TIMING_MS[level];
      if (!timingThreshold) continue;

      const elapsed = now.getTime() - user.createdAt.getTime();
      if (elapsed < timingThreshold) continue;

      const reminder = ONBOARDING_REMINDERS[level];
      if (!reminder) continue;

      // Look up who invited this user
      let inviterName = '';
      if (level >= 1) {
        const pending = await db.pendingConnection.findFirst({
          where: { fromUserId: user.id },
          select: { toUser: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        });
        if (pending?.toUser?.name) {
          inviterName = pending.toUser.name;
        } else {
          const invite = await db.inviteLink.findFirst({
            where: { usedById: user.id },
            select: { inviter: { select: { name: true } } },
          });
          if (invite?.inviter?.name) {
            inviterName = invite.inviter.name;
          }
        }
      }

      const baseText = reminder.text.replace('{inviterName}', inviterName || 'Social Organizer');
      const userLang = user.language || 'en';
      const [text, buttonText] = await Promise.all([
        translateWithCache(baseText, userLang).catch(() => baseText),
        translateWithCache(reminder.buttonText, userLang).catch(() => reminder.buttonText as string),
      ]);

      const markup: TgReplyMarkup = {
        inline_keyboard: [[{ text: `📱 ${buttonText}`, web_app: { url: WEB_APP_URL } }]],
      };

      const ok = await sendTelegramMessage(tgAccount.platformId, text, markup);

      if (ok) {
        await db.user.update({
          where: { id: user.id },
          data: { onboardingReminderSent: level + 1 },
        });
        onboardingByLevel[level]?.push(user.name);
        onboardingSent++;
        totalSent++;
      }

      if (totalSent % 25 === 0 && totalSent > 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    // ─── Report ───
    console.log(`[Onboarding Reminder] Done: botStart=${botStartSent}/${botStarts.length} (cleaned ${botStartCleaned}), onboarding=${onboardingSent}/${users.length}`);
    if (totalSent > 0) {
      const levelLabel = ['1ч', '24ч', '72ч'];
      const bsDetails = [0, 1, 2]
        .filter((l) => botStartByLevel[l]!.length > 0)
        .map((l) => `  ${levelLabel[l]}: ${botStartByLevel[l]!.length} (${botStartByLevel[l]!.join(', ')})`)
        .join('\n');
      const obDetails = [0, 1, 2]
        .filter((l) => onboardingByLevel[l]!.length > 0)
        .map((l) => `  ${levelLabel[l]}: ${onboardingByLevel[l]!.length} (${onboardingByLevel[l]!.join(', ')})`)
        .join('\n');

      let report = `🔔 <b>Напоминания об онбординге</b>\n\n`;
      report += `📩 <b>/start без регистрации</b>: ${botStartSent} из ${botStarts.length}`;
      if (botStartCleaned > 0) report += ` (зарегались: ${botStartCleaned})`;
      if (bsDetails) report += `\n${bsDetails}`;
      report += `\n\n📩 <b>Не завершили онбординг</b>: ${onboardingSent} из ${users.length}`;
      if (obDetails) report += `\n${obDetails}`;

      await sendTelegramMessage(SUPPORT_CHAT_ID, report).catch(() => {});
    }
  } catch (err) {
    console.error('[Onboarding Reminder] CRASH:', err);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `❌ <b>Ошибка напоминаний об онбординге</b>: ${String(err).substring(0, 200)}`,
    ).catch(() => {});
    throw err;
  }
}
