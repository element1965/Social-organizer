import type { Collection, Prisma } from '@so/db';
import { TRPCError } from '@trpc/server';
import { isClosed } from './collection-view.js';

type NeedState = Pick<Collection, 'creatorId' | 'status' | 'type' | 'cycleNumber' | 'currentCycleStart' | 'amount' | 'blockReason'>;

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
