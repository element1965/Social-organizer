import type { PrismaClient } from '@prisma/client';

export async function canViewContacts(
  db: PrismaClient,
  viewerUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (viewerUserId === targetUserId) return true;

  const target = await db.user.findUnique({
    where: { id: targetUserId },
    select: { hideContacts: true },
  });
  if (!target?.hideContacts) return true;

  // Check direct connection (depth 1)
  const [a, b] = [viewerUserId, targetUserId].sort();
  const conn = await db.connection.findUnique({
    where: { userAId_userBId: { userAId: a!, userBId: b! } },
  });
  if (conn) return true;

  // Check if target has an active collection that notified the viewer
  const notified = await db.notification.findFirst({
    where: {
      userId: viewerUserId,
      collection: { creatorId: targetUserId, status: 'ACTIVE' },
    },
  });
  if (notified) return true;

  return false;
}
