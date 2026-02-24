import type { PrismaClient } from '@so/db';

/**
 * When a user adds new skills, find connected users who need those skills
 * and create SkillMatchNotification records.
 */
export async function createSkillMatchNotifications(
  db: PrismaClient,
  skillOwnerId: string,
  addedCategoryIds: string[],
): Promise<void> {
  if (addedCategoryIds.length === 0) return;

  // Find connected users who NEED these categories
  const matches = await db.$queryRaw<Array<{ userId: string; categoryId: string }>>`
    SELECT un."userId", un."categoryId"
    FROM user_needs un
    JOIN connections c
      ON (c."userAId" = ${skillOwnerId} AND c."userBId" = un."userId")
      OR (c."userBId" = ${skillOwnerId} AND c."userAId" = un."userId")
    WHERE un."categoryId" = ANY(${addedCategoryIds})
      AND un."userId" != ${skillOwnerId}
  `;

  if (matches.length === 0) return;

  // Batch upsert — skip duplicates
  for (const match of matches) {
    try {
      await db.skillMatchNotification.upsert({
        where: {
          userId_matchUserId_categoryId: {
            userId: match.userId,
            matchUserId: skillOwnerId,
            categoryId: match.categoryId,
          },
        },
        create: {
          userId: match.userId,
          matchUserId: skillOwnerId,
          categoryId: match.categoryId,
        },
        update: { status: 'UNREAD', createdAt: new Date() },
      });
    } catch {
      // skip duplicates
    }
  }

  console.log(`[SkillMatch] Created ${matches.length} notifications for user ${skillOwnerId}`);
}

/**
 * When a user adds new needs, find connected users who have those skills
 * and create SkillMatchNotification records (notifying the need owner).
 */
export async function createNeedMatchNotifications(
  db: PrismaClient,
  needOwnerId: string,
  addedCategoryIds: string[],
): Promise<void> {
  if (addedCategoryIds.length === 0) return;

  // Find connected users who HAVE these skills
  const matches = await db.$queryRaw<Array<{ userId: string; categoryId: string }>>`
    SELECT us."userId" AS "userId", us."categoryId"
    FROM user_skills us
    JOIN connections c
      ON (c."userAId" = ${needOwnerId} AND c."userBId" = us."userId")
      OR (c."userBId" = ${needOwnerId} AND c."userAId" = us."userId")
    WHERE us."categoryId" = ANY(${addedCategoryIds})
      AND us."userId" != ${needOwnerId}
  `;

  if (matches.length === 0) return;

  // Notify the need owner that someone in their network has the skill
  for (const match of matches) {
    try {
      await db.skillMatchNotification.upsert({
        where: {
          userId_matchUserId_categoryId: {
            userId: needOwnerId,
            matchUserId: match.userId,
            categoryId: match.categoryId,
          },
        },
        create: {
          userId: needOwnerId,
          matchUserId: match.userId,
          categoryId: match.categoryId,
        },
        update: { status: 'UNREAD', createdAt: new Date() },
      });
    } catch {
      // skip duplicates
    }
  }

  console.log(`[SkillMatch] Created ${matches.length} need-match notifications for user ${needOwnerId}`);
}
