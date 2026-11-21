import type { Prisma, PrismaClient } from '@so/db';
import { confirmedRenewals, needsCycleConfirmation } from './collection-view.js';
import { NEED_REQUEST_TYPES } from './notify-routing.service.js';

const openNeed = {
  status: 'ACTIVE',
  OR: [{ blockReason: null }, { blockReason: { not: 'COMMUNITY' } }],
} satisfies Prisma.CollectionWhereInput;

export function waitingNeedRequests(userId: string, now: Date): Prisma.NotificationWhereInput {
  return {
    userId,
    status: { in: ['UNREAD', 'READ'] },
    type: { in: [...NEED_REQUEST_TYPES] },
    expiresAt: { gt: now },
    collection: {
      ...openNeed,
      creatorId: { not: userId },
      obligations: { none: { userId, unsubscribedAt: null } },
    },
  };
}

export async function waitingNeedRenewals(db: PrismaClient, userId: string) {
  const activeParticipation = { userId, unsubscribedAt: null };
  const candidates = await db.collection.findMany({
    where: {
      ...openNeed,
      creatorId: { not: userId },
      type: 'REGULAR',
      cycleNumber: { gt: 1 },
      currentCycleStart: { not: null },
      obligations: { some: activeParticipation },
    },
    select: {
      id: true,
      creatorId: true,
      status: true,
      blockReason: true,
      type: true,
      cycleNumber: true,
      currentCycleStart: true,
      creator: { select: { id: true, name: true, photoUrl: true } },
      obligations: {
        where: activeParticipation,
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, amount: true },
      },
    },
  });
  const confirmed = await confirmedRenewals(db, userId, candidates);
  return candidates.flatMap(({ obligations, ...collection }) =>
    needsCycleConfirmation(collection, obligations[0], confirmed.has(`${collection.id}:${collection.cycleNumber}`))
      ? [{ collection, amount: obligations.reduce((sum, row) => sum + row.amount, 0) }]
      : [],
  );
}
