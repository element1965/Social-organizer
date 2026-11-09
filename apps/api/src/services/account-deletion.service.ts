import type { PrismaClient, Prisma } from '@so/db';
import { sendUserDeletedNotification } from './notification.service.js';
import { countConnections } from './connection-request.service.js';

/**
 * Deletes an account. Single source for the user-initiated deletion (`user.delete`)
 * and the automatic deletion after 2 years of inactivity.
 *
 * Deletion scenario (SO-15): an account with confirmed connections or with invitees is muted
 * (soft delete) so the invite chain stays intact; otherwise it is deleted without traces.
 * Returns `null` when the user does not exist, is already deleted, or `guard` refused.
 *
 * `guard` runs first inside the deletion transaction (after locking the user row), so a final
 * eligibility check cannot race with a concurrent sign-in. The user-initiated path passes none.
 */
export async function deleteUserAccount(
  db: PrismaClient,
  userId: string,
  opts: { guard?: (tx: Prisma.TransactionClient) => Promise<boolean> } = {},
): Promise<{ mode: 'hard' | 'soft' } | null> {
  // Capture user info before deletion
  const deletingUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      deletedAt: true,
      platformAccounts: { where: { platform: 'TELEGRAM' }, select: { platformId: true } },
    },
  });
  if (!deletingUser || deletingUser.deletedAt) return null;
  const inviteLink = await db.inviteLink.findFirst({
    where: { usedById: userId },
    select: { inviterId: true },
  });

  let mode: 'hard' | 'soft' = 'hard';
  let refused = false;
  await db.$transaction(async (tx) => {
    if (opts.guard) {
      await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
      if (!(await opts.guard(tx))) {
        refused = true;
        return;
      }
    }
    // Connections are counted before they are removed below.
    // Pending requests and unused invite links don't count as connections.
    const [connectionCount, usedInviteCount] = await Promise.all([
      countConnections(tx, userId),
      tx.inviteLink.count({ where: { inviterId: userId, usedById: { not: null } } }),
    ]);
    const hasNetworkTies = connectionCount > 0 || usedInviteCount > 0;

    // Clean up pending connections in both directions
    await tx.pendingConnection.deleteMany({
      where: {
        OR: [
          { fromUserId: userId },
          { toUserId: userId },
        ],
      },
    });

    // Cancel obligations in active collections
    await tx.obligation.deleteMany({
      where: {
        userId,
        collection: { status: { in: ['ACTIVE', 'BLOCKED'] } },
      },
    });

    // Cancel own active collections
    await tx.collection.updateMany({
      where: {
        creatorId: userId,
        status: { in: ['ACTIVE', 'BLOCKED'] },
      },
      data: { status: 'CANCELLED' },
    });

    // Remove user from the network (delete all connections)
    await tx.connection.deleteMany({
      where: {
        OR: [
          { userAId: userId },
          { userBId: userId },
        ],
      },
    });

    if (!hasNetworkTies) {
      // No connections and no invitees — full delete with no traces
      // Clear usedById references pointing to this user
      await tx.inviteLink.updateMany({
        where: { usedById: userId },
        data: { usedById: null, usedAt: null },
      });
      // Remove botStart record
      const tgId = deletingUser.platformAccounts?.[0]?.platformId;
      if (tgId) {
        await tx.botStart.deleteMany({ where: { chatId: tgId } });
      }
      // Hard delete user (cascade removes all related records)
      await tx.user.delete({ where: { id: userId } });
    } else {
      mode = 'soft';
      // Had connections or invitees — soft delete (mute) so their invite chain stays intact
      // but user is removed from the active network
      await tx.user.update({
        where: { id: userId },
        data: {
          deletedAt: new Date(),
          name: 'Deleted user',
          bio: null,
          phone: null,
          photoUrl: null,
          monthlyBudget: 0,
          remainingBudget: 0,
        },
      });
      // Remove contacts, skills, needs so profile is clean
      await tx.userContact.deleteMany({ where: { userId } });
      await tx.userSkill.deleteMany({ where: { userId } });
      await tx.userNeed.deleteMany({ where: { userId } });
    }
  });

  if (refused) return null;

  // Notify inviter that user from their first circle has been deleted
  if (inviteLink?.inviterId && deletingUser.name) {
    sendUserDeletedNotification(db, inviteLink.inviterId, deletingUser.name)
      .catch((err) => console.error('[UserDelete] Failed to notify inviter:', err));
  }

  return { mode };
}
