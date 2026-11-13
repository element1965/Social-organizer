import { findLinkingCode, LinkCodeRateLimitError } from './link-code.service.js';
import { restoreMutedAccount } from './account-restore.service.js';
import { invalidateGraph } from './graph-cache.service.js';
import type { PrismaClient } from '@so/db';

export type TelegramLinkResult = 'linked' | 'merged' | 'already' | 'conflict' | 'invalid';

/** No connections, Needs or Participations: nothing would be lost if the account went away. */
export async function isEmptyAccount(db: PrismaClient, userId: string): Promise<boolean> {
  const [connections, collections, obligations] = await Promise.all([
    db.connection.count({ where: { OR: [{ userAId: userId }, { userBId: userId }] } }),
    db.collection.count({ where: { creatorId: userId } }),
    db.obligation.count({ where: { userId } }),
  ]);
  return connections + collections + obligations === 0;
}

/**
 * Move the sign-in methods of an empty account (Google, Apple, a proven e-mail) and its open invite
 * requests to the account that keeps the person's network, then delete the empty one. Afterwards every
 * method signs in to the same account. A session of the removed account is signed out on its next request.
 */
export async function mergeEmptyAccountInto(db: PrismaClient, emptyId: string, keepId: string): Promise<void> {
  if (emptyId === keepId) return;
  await db.$transaction(async (tx) => {
    const [empty, keep] = await Promise.all([
      tx.user.findUnique({ where: { id: emptyId }, select: { email: true, emailVerifiedAt: true, photoUrl: true } }),
      tx.user.findUnique({ where: { id: keepId }, select: { email: true, photoUrl: true } }),
    ]);
    if (!empty || !keep) return;

    await tx.platformAccount.updateMany({ where: { userId: emptyId }, data: { userId: keepId } });

    const pending = await tx.pendingConnection.findMany({ where: { fromUserId: emptyId, status: 'PENDING' } });
    for (const p of pending) {
      if (p.toUserId === keepId) continue;
      const already = await tx.connection.count({
        where: { OR: [{ userAId: keepId, userBId: p.toUserId }, { userAId: p.toUserId, userBId: keepId }] },
      });
      if (already > 0) continue;
      await tx.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: keepId, toUserId: p.toUserId } },
        create: { fromUserId: keepId, toUserId: p.toUserId, source: p.source },
        update: {},
      });
    }

    // A proven e-mail moves only to an account without one (e-mail is unique)
    const moveEmail = !!empty.email && !!empty.emailVerifiedAt && !keep.email;
    if (moveEmail) await tx.user.update({ where: { id: emptyId }, data: { email: null } });
    await tx.inviteLink.updateMany({ where: { usedById: emptyId }, data: { usedById: null, usedAt: null } });
    await tx.user.delete({ where: { id: emptyId } });
    if (moveEmail || (empty.photoUrl && !keep.photoUrl)) {
      await tx.user.update({
        where: { id: keepId },
        data: {
          ...(moveEmail ? { email: empty.email, emailVerifiedAt: empty.emailVerifiedAt } : {}),
          ...(empty.photoUrl && !keep.photoUrl ? { photoUrl: empty.photoUrl } : {}),
        },
      });
    }
  });
  await restoreMutedAccount(db, keepId);
  invalidateGraph([emptyId, keepId]);
  console.log('[telegram-link] merged empty account', emptyId, 'into', keepId);
}

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
 *   deleted).
 * - The Telegram account has a network and the code owner is the empty one (the person came back
 *   with Google / Apple / e-mail and got a fresh account): the code owner is folded into the
 *   Telegram account ('merged'), so every method signs in there from now on.
 * - Both have data: nothing is changed and 'conflict' is returned.
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
    if (connections + collections + obligations > 0) {
      // The Telegram account is the real one (it has a network) and the code owner is a fresh, empty
      // account made by a second sign-in method (Google, Apple, e-mail): fold the empty one into it
      if (await isEmptyAccount(db, target.id)) {
        await mergeEmptyAccountInto(db, target.id, duplicateId);
        await db.linkingCode.deleteMany({ where: { userId: target.id } }).catch(() => {});
        return 'merged';
      }
      return 'conflict';
    }

    // Keep invite requests the duplicate already sent (e.g. it accepted an invite)
    const pending = await db.pendingConnection.findMany({
      where: { fromUserId: duplicateId, status: 'PENDING' },
    });
    for (const p of pending) {
      if (p.toUserId === target.id) continue;
      await db.pendingConnection.upsert({
        where: { fromUserId_toUserId: { fromUserId: target.id, toUserId: p.toUserId } },
        create: { fromUserId: target.id, toUserId: p.toUserId, source: p.source },
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
    invalidateGraph([duplicateId]);
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
