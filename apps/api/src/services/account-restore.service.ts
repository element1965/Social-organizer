import type { PrismaClient } from '@so/db';
import { countConnections } from './connection-request.service.js';
import { invalidateGraph } from './graph-cache.service.js';

/**
 * Bring back an account the Telegram bot muted.
 *
 * Two things set `deletedAt`: the person's own deletion (or the 2-year inactivity cleanup), which always
 * removes every connection (`deleteUserAccount`), and the bot, which mutes a person it believes blocked it
 * and keeps their connections (`removeBlockedUser`). So a deleted account that still has connections was
 * muted by the bot, not by its owner. When that person signs in again, the account comes back instead of
 * answering "Account has been deleted" to every request, which is what pushed a newcomer to create a
 * second account on 11.11.2026.
 *
 * Returns true when the account was restored. Accounts deleted by their owner stay deleted.
 */
export async function restoreMutedAccount(
  db: PrismaClient,
  userId: string,
  profile: { name?: string | null; photoUrl?: string | null } = {},
): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { deletedAt: true, name: true, photoUrl: true } });
  if (!user?.deletedAt) return false;
  if ((await countConnections(db, userId)) === 0) return false;

  const name = profile.name?.trim() || (user.name && user.name !== 'Deleted user' ? user.name : 'User');
  await db.user.update({
    where: { id: userId },
    data: {
      deletedAt: null,
      name,
      ...(profile.photoUrl && !user.photoUrl ? { photoUrl: profile.photoUrl } : {}),
    },
  });
  invalidateGraph();
  console.log(`[account-restore] restored muted account ${userId} on sign-in`);
  return true;
}
