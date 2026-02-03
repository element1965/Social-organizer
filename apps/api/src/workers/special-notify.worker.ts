import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';

/**
 * Every hour: find users who helped someone for the first time
 * (created an obligation) but haven't received notification about
 * Author/Developer collections yet. Send them a notification.
 */
export async function processSpecialNotify(_job: Job): Promise<void> {
  const db = getDb();

  // Find active collections of Author and Developer
  const specialCollections = await db.collection.findMany({
    where: {
      status: 'ACTIVE',
      creator: { role: { in: ['AUTHOR', 'DEVELOPER'] } },
    },
    select: { id: true, creator: { select: { role: true } } },
  });

  if (specialCollections.length === 0) return;

  const specialCollectionIds = specialCollections.map((c) => c.id);

  // Users who have at least 1 obligation (they already helped)
  // but no notification about special collections
  const usersWithObligations = await db.obligation.findMany({
    select: { userId: true },
    distinct: ['userId'],
  });

  if (usersWithObligations.length === 0) return;

  const userIds = usersWithObligations.map((o) => o.userId);

  // From them - those who haven't received notification about special collections yet
  const alreadyNotified = await db.notification.findMany({
    where: {
      collectionId: { in: specialCollectionIds },
      userId: { in: userIds },
    },
    select: { userId: true, collectionId: true },
  });

  const notifiedSet = new Set(alreadyNotified.map((n) => `${n.userId}:${n.collectionId}`));

  const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);

  for (const uid of userIds) {
    for (const col of specialCollections) {
      if (notifiedSet.has(`${uid}:${col.id}`)) continue;

      const type = col.creator.role === 'AUTHOR' ? 'SPECIAL_AUTHOR' : 'SPECIAL_DEVELOPER';
      try {
        await db.notification.upsert({
          where: {
            userId_collectionId_type_wave: { userId: uid, collectionId: col.id, type, wave: 0 },
          },
          create: {
            userId: uid,
            collectionId: col.id,
            type,
            handshakePath: [],
            expiresAt,
            wave: 0,
          },
          update: {},
        });
      } catch {
        // skip
      }
    }
  }
}
