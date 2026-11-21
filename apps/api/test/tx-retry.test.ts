import { Prisma, type PrismaClient } from '@so/db';
import { expect, it, vi } from 'vitest';
import { transactionWithRetry } from '../src/lib/tx-retry.js';

const version = { clientVersion: 'test' };
const operation = async () => 'committed';

it.each([
  new Prisma.PrismaClientKnownRequestError('deadlock', { ...version, code: 'P2010', meta: { code: '40P01' } }),
  new Prisma.PrismaClientKnownRequestError('write conflict', { ...version, code: 'P2034' }),
  Object.assign(new Error('could not serialize access'), { code: '40001' }),
])('restarts an interactive transaction after %s', async (error) => {
  const transaction = vi.fn().mockRejectedValueOnce(error).mockResolvedValue('committed');
  const db = { $transaction: transaction } as unknown as PrismaClient;
  await expect(transactionWithRetry(db, operation)).resolves.toBe('committed');
  expect(transaction.mock.calls).toEqual([[operation], [operation]]);
});

it('rethrows a retryable error after three retries', async () => {
  const error = Object.assign(new Error('deadlock'), { code: '40P01' });
  const transaction = vi.fn().mockRejectedValue(error);
  const db = { $transaction: transaction } as unknown as PrismaClient;
  await expect(transactionWithRetry(db, operation)).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(4);
});

it.each([
  new Prisma.PrismaClientKnownRequestError('foreign key violation', { ...version, code: 'P2010', meta: { code: '23503' } }),
  new Error('A message mentioning 40P01'),
])('immediately rethrows an unrelated error: %s', async (error) => {
  const transaction = vi.fn().mockRejectedValue(error);
  const db = { $transaction: transaction } as unknown as PrismaClient;
  await expect(transactionWithRetry(db, operation)).rejects.toBe(error);
  expect(transaction).toHaveBeenCalledTimes(1);
});
