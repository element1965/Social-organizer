import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';

/** People handled per collection and run; the rest follow on the next hourly runs */
const BATCH = 500;

/**
 * Every hour: people who already helped someone (have a pledge) hear about the active collections of the
 * Author and the Developer, once. In-app entry only: an external message would need its own texts in all
 * languages, and these collections are also announced through the network when they have an amount.
 *
 * Skipped: the author, deleted accounts, people who switched off new collections, people on either side of
 * the author's ignore list, people who already have any entry about the collection or pledged to it.
 */
export async function runSpecialNotify(db: PrismaClient): Promise<number> {
  const collections = await db.collection.findMany({
    where: {
      status: 'ACTIVE',
      blockReason: null,
      creator: { role: { in: ['AUTHOR', 'DEVELOPER'] }, deletedAt: null },
    },
    select: { id: true, creatorId: true, creator: { select: { role: true } } },
  });

  let total = 0;
  for (const col of collections) {
    try {
      const ignore = await db.ignoreEntry.findMany({
        where: { OR: [{ fromUserId: col.creatorId }, { toUserId: col.creatorId }] },
        select: { fromUserId: true, toUserId: true },
      });
      const excluded = new Set<string>([col.creatorId]);
      for (const e of ignore) excluded.add(e.fromUserId === col.creatorId ? e.toUserId : e.fromUserId);

      const users = await db.user.findMany({
        where: {
          id: { notIn: [...excluded] },
          deletedAt: null,
          notifyNewCollections: true,
          obligations: { some: {}, none: { collectionId: col.id } },
          notifications: { none: { collectionId: col.id } },
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
        take: BATCH,
      });
      if (users.length === 0) continue;

      const type = col.creator.role === 'AUTHOR' ? 'SPECIAL_AUTHOR' : 'SPECIAL_DEVELOPER';
      const expiresAt = new Date(Date.now() + NOTIFICATION_TTL_HOURS * 60 * 60 * 1000);
      const res = await db.notification.createMany({
        data: users.map((u) => ({ userId: u.id, collectionId: col.id, type, handshakePath: [], expiresAt, wave: 0 })),
        skipDuplicates: true,
      });
      total += res.count;
      console.log(`[special-notify] collection ${col.id}: ${res.count} people told`);
    } catch (err) {
      console.error(`[special-notify] collection ${col.id} failed:`, err);
    }
  }
  return total;
}

export async function processSpecialNotify(_job: Job): Promise<void> {
  await runSpecialNotify(getDb());
}
