import { setTimeout } from 'node:timers/promises';
import { Prisma, type PrismaClient } from '@so/db';

const MAX_RETRIES = 3;

function isRetryableSqlState(code: unknown): boolean {
  return code === '40P01' || code === '40001';
}

function isRetryableTransactionError(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return error.code === 'P2034' || isRetryableSqlState(error.meta?.code);
  }
  if (error instanceof Prisma.PrismaClientUnknownRequestError) {
    // The Prisma 6 engine can surface a model write's SQLSTATE only in the connector error.
    return /QueryError\(PostgresError \{ code: "(40P01|40001)",/.test(error.message);
  }
  return typeof error === 'object' && error !== null && 'code' in error && isRetryableSqlState(error.code);
}

/** Retry the whole interactive transaction. Dispatch side effects only after it returns. */
export async function transactionWithRetry<T>(
  db: PrismaClient,
  operation: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let retry = 0; ; retry++) {
    try {
      return await db.$transaction(operation);
    } catch (error) {
      if (retry === MAX_RETRIES || !isRetryableTransactionError(error)) throw error;
      await setTimeout(15 * 2 ** retry + Math.random() * 15);
    }
  }
}
