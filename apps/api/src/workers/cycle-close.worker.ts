import type { Job } from 'bullmq';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';

/**
 * Каждый час: проверяем регулярные сборы, у которых прошёл 28-дневный цикл.
 * Закрываем текущий цикл и открываем новый (сброс обязательств, инкремент cycleNumber).
 */
export async function processCycleClose(_job: Job): Promise<void> {
  const db = getDb();
  const cutoff = new Date(Date.now() - REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000);

  const expiredCycles = await db.collection.findMany({
    where: {
      type: 'REGULAR',
      status: { in: ['ACTIVE', 'BLOCKED'] },
      currentCycleStart: { lte: cutoff },
    },
  });

  for (const collection of expiredCycles) {
    await db.$transaction(async (tx) => {
      // Закрываем текущий цикл → новый
      await tx.collection.update({
        where: { id: collection.id },
        data: {
          currentCycleStart: new Date(),
          cycleNumber: { increment: 1 },
          status: 'ACTIVE',
          blockedAt: null,
        },
      });

      // Удаляем одноразовые обязательства (не подписки)
      await tx.obligation.deleteMany({
        where: {
          collectionId: collection.id,
          isSubscription: false,
        },
      });

      // Удаляем отписавшиеся подписки
      await tx.obligation.deleteMany({
        where: {
          collectionId: collection.id,
          unsubscribedAt: { not: null },
        },
      });
    });
  }
}
