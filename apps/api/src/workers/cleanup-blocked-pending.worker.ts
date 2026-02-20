import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import {
  checkChatExists,
  removeBlockedUser,
  SUPPORT_CHAT_ID,
  sendTelegramMessage,
  type RemovedUserInfo,
} from '../services/telegram-bot.service.js';

/**
 * Every hour: find all PENDING connections, check if any involved user
 * has blocked the bot via TG getChat API, and hard-delete blocked users.
 */
export async function processCleanupBlockedPending(_job: Job): Promise<void> {
  console.log('[Cleanup Blocked Pending] Worker started');
  const db = getDb();

  try {
    // Load all PENDING connections
    const pending = await db.pendingConnection.findMany({
      where: { status: 'PENDING' },
      select: { fromUserId: true, toUserId: true },
    });

    if (pending.length === 0) {
      console.log('[Cleanup Blocked Pending] No pending connections, skipping');
      return;
    }

    // Collect unique user IDs
    const userIds = new Set<string>();
    for (const p of pending) {
      userIds.add(p.fromUserId);
      userIds.add(p.toUserId);
    }

    // Load TG platformIds for these users
    const accounts = await db.platformAccount.findMany({
      where: {
        platform: 'TELEGRAM',
        userId: { in: [...userIds] },
      },
      select: { userId: true, platformId: true },
    });

    if (accounts.length === 0) {
      console.log('[Cleanup Blocked Pending] No TG accounts found for pending users');
      return;
    }

    let checked = 0;
    const removedUsers: RemovedUserInfo[] = [];

    for (const acc of accounts) {
      const exists = await checkChatExists(acc.platformId);
      checked++;

      if (!exists) {
        const info = await removeBlockedUser(acc.platformId);
        if (info) removedUsers.push(info);
      }

      // Rate limit: 50ms between TG API calls
      await new Promise((r) => setTimeout(r, 50));
    }

    console.log(`[Cleanup Blocked Pending] Done: checked ${checked}, removed ${removedUsers.length}`);

    if (removedUsers.length > 0) {
      const details = removedUsers.map((u) => {
        const contacts = u.contacts.map((c) => `${c.type}: ${c.value}`).join(', ');
        return `• ${u.name} (TG: ${u.platformId}${contacts ? `, ${contacts}` : ''})`;
      }).join('\n');
      await sendTelegramMessage(
        SUPPORT_CHAT_ID,
        `🧹 <b>Очистка заблокированных</b>: проверено ${checked}, удалено ${removedUsers.length}\n${details}`,
      ).catch(() => {});
    }
  } catch (err) {
    console.error('[Cleanup Blocked Pending] CRASH:', err);
    await sendTelegramMessage(
      SUPPORT_CHAT_ID,
      `❌ <b>Ошибка очистки заблокированных</b>: ${String(err).substring(0, 200)}`,
    ).catch(() => {});
    throw err;
  }
}
