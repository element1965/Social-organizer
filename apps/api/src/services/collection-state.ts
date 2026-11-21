import type { Collection, Prisma } from '@so/db';
import { TRPCError } from '@trpc/server';
import { isClosed } from './collection-view.js';

export type NeedState = Pick<Collection, 'creatorId' | 'status' | 'type' | 'cycleNumber' | 'currentCycleStart' | 'amount' | 'blockReason'>;

/** Serialize account deletion with writes that can give the account a new parent Need. */
export async function lockNeedAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`need-account:${userId}`}, 0))`;
}

export async function lockActiveNeedAccount(tx: Prisma.TransactionClient, userId: string): Promise<void> {
  await lockNeedAccount(tx, userId);
  const user = await tx.user.findUnique({ where: { id: userId }, select: { deletedAt: true } });
  if (!user) throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Account not found' });
  if (user.deletedAt) throw new TRPCError({ code: 'FORBIDDEN', message: 'Account has been deleted' });
}

/** Lock the parent before touching obligations so marks and pledges serialize with closure and rollover. */
export async function findNeedForUpdate(tx: Prisma.TransactionClient, id: string): Promise<NeedState | undefined> {
  const [need] = await tx.$queryRaw<NeedState[]>`
    SELECT "creatorId", "status", "type", "cycleNumber", "currentCycleStart", "amount", "blockReason"
    FROM collections WHERE "id" = ${id} FOR UPDATE
  `;
  return need;
}

export async function lockNeed(tx: Prisma.TransactionClient, id: string): Promise<NeedState> {
  const need = await findNeedForUpdate(tx, id);
  if (!need) throw new TRPCError({ code: 'NOT_FOUND' });
  return need;
}

export function assertOpenNeed(need: Pick<NeedState, 'status'>): void {
  if (isClosed(need)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: 'Collection is not open', cause: { needClosed: true } });
  }
}
