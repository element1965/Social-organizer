import type { PrismaClient, Prisma } from '@so/db';
import { transactionWithRetry } from '../lib/tx-retry.js';
import { sendUserDeletedNotification } from './notification.service.js';
import { countConnections } from './connection-request.service.js';
import { invalidateGraph } from './graph-cache.service.js';
import { lockNeedAccount, type NeedState } from './collection-state.js';
import { applyCollectionGoal } from './collection-amount.js';

/**
 * Deletes an account. Single source for the user-initiated deletion (`user.delete`)
 * and the automatic deletion after 2 years of inactivity.
 *
 * Deletion scenario (SO-15): an account with confirmed connections or with invitees is muted
 * (soft delete) so the invite chain stays intact; otherwise it is deleted without traces.
 * Returns `null` when the user does not exist, is already deleted, or `guard` refused.
 *
 * `guard` runs before any deletion writes, under the user row lock, so a final
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

  const deleted = await transactionWithRetry(db, async (tx) => {
    await lockNeedAccount(tx, userId);
    const account = await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
    if (!account || account.deletedAt) return null;

    // A pledge or closure holding a Need lock must finish before the deletion statement
    // gets its snapshot. Include historical Needs that a hard deletion can touch by cascade.
    const needs = await tx.$queryRaw<(NeedState & { id: string })[]>`
      SELECT c."id", c."creatorId", c."status", c."type", c."cycleNumber",
        c."currentCycleStart", c."amount", c."blockReason"
      FROM collections c
      WHERE c."creatorId" = ${userId} OR EXISTS (
        SELECT 1 FROM obligations o WHERE o."collectionId" = c."id" AND o."userId" = ${userId}
      )
      ORDER BY c."id" FOR UPDATE OF c
    `;

    await tx.$executeRaw`SELECT 1 FROM "users" WHERE "id" = ${userId} FOR UPDATE`;
    if (opts.guard && !(await opts.guard(tx))) return null;
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

    for (const need of needs) {
      if (need.creatorId !== userId && need.status === 'BLOCKED' && need.blockReason == null) {
        await applyCollectionGoal(tx, need.id, need);
      }
    }

    // Use a fresh status query to catch owned Needs created while the lock query was waiting.
    await tx.collection.updateMany({
      where: {
        creatorId: userId,
        status: { in: ['ACTIVE', 'BLOCKED'] },
      },
      data: { status: 'CANCELLED' },
    });

    // Remove user from the network (delete all connections)
    const links = await tx.connection.findMany({
      where: { OR: [{ userAId: userId }, { userBId: userId }] },
      select: { userAId: true, userBId: true },
    });
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
      return { mode: 'hard' as const, links };
    } else {
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
          budgetUpdatedAt: new Date(),
        },
      });
      // Remove contacts, skills, needs so profile is clean
      await tx.userContact.deleteMany({ where: { userId } });
      await tx.userSkill.deleteMany({ where: { userId } });
      await tx.userNeed.deleteMany({ where: { userId } });
      return { mode: 'soft' as const, links };
    }
  });

  if (!deleted) return null;
  const { mode, links } = deleted;
  // Each former contact lost a direct connection and needs its cached counts refreshed.
  invalidateGraph([userId, ...links.map((c) => (c.userAId === userId ? c.userBId : c.userAId))]);
  if (mode === 'soft') {
    await db.userSignupCampaign.deleteMany({ where: { userId } })
      .catch((error) => console.warn('[UserDelete] Could not remove campaign attribution:', error));
  }

  // Notify inviter that user from their first circle has been deleted
  if (inviteLink?.inviterId && deletingUser.name) {
    sendUserDeletedNotification(db, inviteLink.inviterId, deletingUser.name, userId)
      .catch((err) => console.error('[UserDelete] Failed to notify inviter:', err));
  }

  return { mode };
}
