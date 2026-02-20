import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  sendTelegramMessage,
  SUPPORT_CHAT_ID,
  ONBOARDING_REMINDERS,
  type TgReplyMarkup,
} from '../services/telegram-bot.service.js';
import { translateBroadcastMessage } from '../services/translate.service.js';

const WEB_APP_URL = process.env.WEB_APP_URL || 'https://www.orginizer.com';

/** Timing thresholds (in milliseconds) for each reminder level */
const TIMING_MS = [
  1 * 60 * 60 * 1000,      // level 1: 1 hour
  24 * 60 * 60 * 1000,     // level 2: 24 hours
  72 * 60 * 60 * 1000,     // level 3: 72 hours
];

/**
 * Onboarding Reminder Worker — runs every hour.
 * Finds users who haven't completed onboarding and sends up to 3 reminder messages
 * at increasing intervals (1h, 24h, 72h after registration).
 */
export async function processOnboardingReminder(_job: Job): Promise<void> {
  console.log('[Onboarding Reminder] Worker started');
  const db = getDb();
  const now = new Date();

  try {
    // Find all users who haven't completed onboarding and have a TG account
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

    if (users.length === 0) {
      console.log('[Onboarding Reminder] No users to remind');
      return;
    }

    // Translation cache: level:lang → { text, buttonText }
    const translationCache = new Map<string, { text: string; buttonText: string }>();

    let sent = 0;

    for (const user of users) {
      const tgAccount = user.platformAccounts[0];
      if (!tgAccount) continue;

      const level = user.onboardingReminderSent; // 0, 1, or 2
      const timingThreshold = TIMING_MS[level];
      if (!timingThreshold) continue;

      const elapsed = now.getTime() - user.createdAt.getTime();
      if (elapsed < timingThreshold) continue;

      const reminder = ONBOARDING_REMINDERS[level];
      if (!reminder) continue;

      // Look up who invited this user (for personalized messages)
      let inviterName = '';
      if (level >= 1) {
        // Check PendingConnection first (most common for invited users)
        const pending = await db.pendingConnection.findFirst({
          where: { fromUserId: user.id },
          select: { toUser: { select: { name: true } } },
          orderBy: { createdAt: 'asc' },
        });
        if (pending?.toUser?.name) {
          inviterName = pending.toUser.name;
        } else {
          // Check InviteLink
          const invite = await db.inviteLink.findFirst({
            where: { usedById: user.id },
            select: { inviter: { select: { name: true } } },
          });
          if (invite?.inviter?.name) {
            inviterName = invite.inviter.name;
          }
        }
      }

      // Prepare text with inviter name substitution
      let text = reminder.text.replace('{inviterName}', inviterName || 'Social Organizer');
      let buttonText: string = reminder.buttonText;

      // Translate if not Russian
      const userLang = user.language || 'en';
      const cacheKey = `${level}:${userLang}:${inviterName ? '1' : '0'}`;
      if (userLang !== 'ru') {
        const cached = translationCache.get(cacheKey);
        if (cached) {
          text = cached.text;
          buttonText = cached.buttonText;
        } else {
          try {
            const [tText, tBtn] = await Promise.all([
              translateBroadcastMessage(text, userLang),
              translateBroadcastMessage(buttonText, userLang),
            ]);
            text = tText;
            buttonText = tBtn;
            translationCache.set(cacheKey, { text, buttonText });
          } catch {
            // Keep Russian text as fallback
          }
        }
      }

      // Send with web_app button
      const markup: TgReplyMarkup = {
        inline_keyboard: [[{ text: `📱 ${buttonText}`, web_app: { url: WEB_APP_URL } }]],
      };

      const ok = await sendTelegramMessage(tgAccount.platformId, text, markup);

      if (ok) {
        await db.user.update({
          where: { id: user.id },
          data: { onboardingReminderSent: level + 1 },
        });
        sent++;
      }

      // Rate limit: pause every 25 sends
      if (sent % 25 === 0 && sent > 0) {
        await new Promise((r) => setTimeout(r, 1100));
      }
    }

    console.log(`[Onboarding Reminder] Done: sent ${sent} / ${users.length} users`);
    if (sent > 0) {
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `🔔 <b>Onboarding reminders</b>: sent ${sent} / ${users.length} users`,
      ).catch(() => {});
    }
  } catch (err) {
    console.error('[Onboarding Reminder] CRASH:', err);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `❌ <b>Onboarding reminder CRASH</b>: ${String(err).substring(0, 200)}`,
    ).catch(() => {});
    throw err;
  }
}
