import type { PrismaClient } from '@so/db';
import { TRPCError } from '@trpc/server';
import { MAX_CONNECTIONS } from '@so/shared';
import { sendPendingNotification } from './notification.service.js';
import { syncMilestonesForPair } from './milestone.service.js';

/**
 * One place that answers a connection request (PendingConnection).
 * Used by the app (pending.accept / pending.reject) and the Telegram bot buttons,
 * so every channel changes the same server record.
 *
 * - Only the addressee (toUserId) may answer.
 * - The status flips PENDING → ACCEPTED/REJECTED with a conditional update, so repeats,
 *   double taps and a second device never create a duplicate or a second notification.
 * - Repeating the same answer is a no-op success; the opposite answer after resolution is a conflict.
 * - Accepting checks the 150-connection limit for both people.
 */

export type RequestAction = 'accept' | 'reject';

export type RespondResult = {
  outcome: 'accepted' | 'rejected' | 'alreadyAccepted' | 'alreadyRejected';
  fromUserId: string;
  toUserId: string;
};

/** Error codes the UI and the bot translate into a clear next step. */
export const REQUEST_ERRORS = {
  notFound: 'REQUEST_NOT_FOUND',
  forbidden: 'REQUEST_NOT_YOURS',
  resolved: 'REQUEST_ALREADY_RESOLVED',
  requesterGone: 'REQUESTER_DELETED',
  limitSelf: 'CONNECTION_LIMIT_SELF',
  limitOther: 'CONNECTION_LIMIT_OTHER',
} as const;

function sortPair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

export async function countConnections(db: PrismaClient, userId: string): Promise<number> {
  return db.connection.count({ where: { OR: [{ userAId: userId }, { userBId: userId }] } });
}

/** Throws if adding a new connection between the two users would exceed the limit for either of them. */
export async function assertConnectionSlots(db: PrismaClient, actorId: string, otherId: string): Promise<void> {
  const [userAId, userBId] = sortPair(actorId, otherId);
  const existing = await db.connection.findUnique({ where: { userAId_userBId: { userAId, userBId } } });
  if (existing) return; // already connected, no new slot is used
  const [mine, theirs] = await Promise.all([countConnections(db, actorId), countConnections(db, otherId)]);
  if (mine >= MAX_CONNECTIONS) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: REQUEST_ERRORS.limitSelf });
  }
  if (theirs >= MAX_CONNECTIONS) {
    throw new TRPCError({ code: 'PRECONDITION_FAILED', message: REQUEST_ERRORS.limitOther });
  }
}

export async function respondToConnectionRequest(
  db: PrismaClient,
  pendingId: string,
  actorId: string,
  action: RequestAction,
): Promise<RespondResult> {
  const pending = await db.pendingConnection.findUnique({
    where: { id: pendingId },
    include: { fromUser: { select: { deletedAt: true } } },
  });
  if (!pending) throw new TRPCError({ code: 'NOT_FOUND', message: REQUEST_ERRORS.notFound });
  if (pending.toUserId !== actorId) throw new TRPCError({ code: 'FORBIDDEN', message: REQUEST_ERRORS.forbidden });

  const base = { fromUserId: pending.fromUserId, toUserId: pending.toUserId };
  const resolved = (status: string): RespondResult => {
    if (status === 'ACCEPTED' && action === 'accept') return { ...base, outcome: 'alreadyAccepted' };
    if (status === 'REJECTED' && action === 'reject') return { ...base, outcome: 'alreadyRejected' };
    throw new TRPCError({ code: 'CONFLICT', message: REQUEST_ERRORS.resolved });
  };
  if (pending.status !== 'PENDING') return resolved(pending.status);

  if (action === 'accept') {
    if (pending.fromUser.deletedAt) {
      throw new TRPCError({ code: 'BAD_REQUEST', message: REQUEST_ERRORS.requesterGone });
    }
    await assertConnectionSlots(db, pending.toUserId, pending.fromUserId);
  }

  const status = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
  const changed = await db.$transaction(async (tx) => {
    const res = await tx.pendingConnection.updateMany({
      where: { id: pendingId, status: 'PENDING' },
      data: { status, resolvedAt: new Date() },
    });
    if (res.count === 0) return false;
    if (action === 'accept') {
      const [userAId, userBId] = sortPair(pending.fromUserId, pending.toUserId);
      await tx.connection.upsert({
        where: { userAId_userBId: { userAId, userBId } },
        create: { userAId, userBId },
        update: {},
      });
    }
    return true;
  });

  if (!changed) {
    // Someone (another device, the bot) answered first — report the stored state.
    const fresh = await db.pendingConnection.findUnique({ where: { id: pendingId }, select: { status: true } });
    return resolved(fresh?.status ?? 'PENDING');
  }

  if (action === 'accept') await syncMilestonesForPair(db, pending.fromUserId, pending.toUserId);

  const actor = await db.user.findUnique({ where: { id: actorId }, select: { name: true } });
  sendPendingNotification(db, pending.fromUserId, action === 'accept' ? 'accepted' : 'rejected', actor?.name || '').catch(() => {});

  return { ...base, outcome: action === 'accept' ? 'accepted' : 'rejected' };
}
