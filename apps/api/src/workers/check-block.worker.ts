import type { Job } from 'bullmq';
import { getDb } from '@so/db';

/**
 * По событию: проверяем, достигла ли сумма обязательств цели сбора → BLOCKED.
 */
export async function processCheckBlock(job: Job<{ collectionId: string }>): Promise<void> {
  const db = getDb();
  const { collectionId } = job.data;

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    select: { id: true, amount: true, status: true },
  });

  if (!collection || collection.status !== 'ACTIVE') return;

  // Спецпрофильные сборы (без целевой суммы) не блокируются
  if (collection.amount == null) return;

  const totalAmount = await db.obligation.aggregate({
    where: { collectionId },
    _sum: { amount: true },
  });

  if ((totalAmount._sum.amount ?? 0) >= collection.amount) {
    await db.collection.update({
      where: { id: collectionId },
      data: { status: 'BLOCKED', blockedAt: new Date() },
    });
  }
}
