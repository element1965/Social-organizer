import { findLinkingCode, LinkCodeRateLimitError } from './link-code.service.js';
import type { PrismaClient } from '@so/db';

export type TelegramLinkResult = 'linked' | 'already' | 'conflict' | 'invalid';

/**
 * Attach a Telegram account to an existing user (Google / e-mail / Apple sign-in).
 *
 * The user presses "Connect Telegram" in Settings: the app creates a 6-digit link code
 * and opens the bot with startapp=link_CODE. The mini app then signs in with initData,
 * whose start_param carries the code, and we land here.
 *
 * - Telegram not registered yet → it is attached to the code owner.
 * - Telegram already has its own account (opened the mini app before, got a second
 *   account): if that account is empty — no connections, collections or obligations —
 *   it is merged (Telegram moves over, pending invites move over, the empty account is
 *   deleted). If it has data, nothing is changed and 'conflict' is returned.
 */
export async function linkTelegramByCode(
  db: PrismaClient,
  code: string,
  platformId: string,
  initData: string,
  callerKeys: string[],
): Promise<TelegramLinkResult> {
  const linkingCode = await findLinkingCode(db, code, callerKeys).catch((err) => {
    if (err instanceof LinkCodeRateLimitError) return null;
    throw err;
  });
  if (!linkingCode) return 'invalid';

  const target = await db.user.findUnique({ where: { id: linkingCode.userId } });
  if (!target || target.deletedAt) return 'invalid';

  const existing = await db.platformAccount.findUnique({
    where: { platform_platformId: { platform: 'TELEGRAM', platformId } },
  });

  if (existing?.userId === target.id) {
    await db.linkingCode.delete({ where: { id: linkingCode.id } }).catch(() => {});
    return 'already';
  }

  // The target already has a different Telegram attached — do not replace it silently
  const targetTelegram = await db.platformAccount.findFirst({
    where: { userId: target.id, platform: 'TELEGRAM' },
  });
  if (targetTelegram) return 'conflict';

  if (existing) {
    const duplicateId = existing.userId;
    const [connections, collections, obligations] = await Promise.all([
      db.connection.count({ where: { OR: [{ userAId: duplicateId }, { userBId: duplicateId }] } }),
      db.collection.count({ where: { creatorId: duplicateId } }),
      db.obligation.count({ where: { userId: duplicateId } }),
    ]);
    if (connections + collections + obligations > 0) return 'conflict';

    // Keep invite requests the duplicate already sent (e.g. it accepted an invite)
    const pending = await db.pendingConnection.findMany({
      where: { fromUserId: duplicateId, status: 'PENDING' },
    });
    for (const p of pending) {
      if (p.toUserId === target.id) continue;
      await db.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: target.id, toUserId: p.toUserId } },
        create: { fromUserId: target.id, toUserId: p.toUserId },
        update: {},
      }).catch(() => {});
    }

    await db.platformAccount.update({
      where: { id: existing.id },
      data: { userId: target.id, accessToken: initData },
    });
    await db.user.delete({ where: { id: duplicateId } }).catch(async () => {
      await db.user.update({ where: { id: duplicateId }, data: { deletedAt: new Date() } }).catch(() => {});
    });
    console.log('[telegram-link] merged empty duplicate', duplicateId, 'into', target.id);
  } else {
    await db.platformAccount.create({
      data: { userId: target.id, platform: 'TELEGRAM', platformId, accessToken: initData },
    });
    console.log('[telegram-link] telegram attached to', target.id);
  }

  await db.linkingCode.delete({ where: { id: linkingCode.id } }).catch(() => {});
  return 'linked';
}
