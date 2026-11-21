import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@so/db';
import { vi } from 'vitest';

const composeTestUrl = 'postgresql://organizer:organizer-dev@127.0.0.1:54329/social_organizer_test';
const invalidUrl = 'Tests require a local PostgreSQL DATABASE_URL with "test" in the database name.';
const dbPackage = new URL('../../../packages/db/package.json', import.meta.url);
const prismaCli = createRequire(dbPackage).resolve('prisma/build/index.js');

export async function createTestDatabase() {
  let url: URL;
  try {
    url = new URL(process.env.DATABASE_URL ?? composeTestUrl);
  } catch {
    throw new Error(invalidUrl);
  }
  const database = url.pathname.slice(1);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    || !/^[a-z0-9_]*test[a-z0-9_]*$/i.test(database)) {
    throw new Error(invalidUrl);
  }

  // Discard URL options, including socket/host and schema overrides.
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  url.search = '';
  url.hash = '';
  url.pathname = '/postgres';
  const maintenance = new PrismaClient({ datasourceUrl: url.href });
  const name = `so_test_${randomUUID().replaceAll('-', '')}`;
  url.pathname = `/${name}`;
  const db = new PrismaClient({ datasourceUrl: url.href });

  let created = false;
  async function dispose() {
    try {
      await db.$disconnect();
    } finally {
      try {
        // Only drop the database this run successfully created.
        if (created) await maintenance.$executeRawUnsafe(`DROP DATABASE "${name}" WITH (FORCE)`);
      } finally {
        await maintenance.$disconnect();
      }
    }
  }

  try {
    await maintenance.$executeRawUnsafe(`CREATE DATABASE "${name}"`);
    created = true;
    const schema = spawnSync(process.execPath, [prismaCli, 'db', 'push', '--skip-generate'], {
      cwd: fileURLToPath(new URL('.', dbPackage)),
      env: { ...process.env, DATABASE_URL: url.href },
      timeout: 45_000,
    });
    if (schema.status !== 0) {
      throw new Error(`Could not set up the disposable test schema (Prisma exit ${schema.status}).`);
    }
    return { db, dispose };
  } catch (error) {
    await dispose();
    throw error;
  }
}

/** Pause the first transaction just after its Need read, keeping the real connection and any locks open. */
export function pauseAfterNeedRead(db: PrismaClient) {
  let signalRead!: (pid: number) => void;
  const read = new Promise<number>((resolve) => { signalRead = resolve; });
  let resume!: () => void;
  const paused = new Promise<void>((resolve) => { resume = resolve; });
  const transact = db.$transaction.bind(db);
  const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((operation: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    transact(async (tx) => {
      const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      const query = tx.$queryRaw.bind(tx);
      let firstRead = true;
      const gated = new Proxy(tx, {
        get(target, key, receiver) {
          if (key !== '$queryRaw') return Reflect.get(target, key, receiver);
          return async (...args: Parameters<typeof query>) => {
            const result = await query(...args);
            if (firstRead) {
              firstRead = false;
              signalRead(backend!.pid);
              await paused;
            }
            return result;
          };
        },
      });
      return operation(gated);
    })) as typeof db.$transaction);
  return { read, resume, restore: () => spy.mockRestore() };
}

export async function isBlockingTransaction(db: PrismaClient, pid: number) {
  const [row] = await db.$queryRaw<{ waiting: boolean }[]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_stat_activity
      WHERE datname = current_database() AND ${pid}::integer = ANY(pg_blocking_pids(pid))
    ) AS waiting
  `;
  return row!.waiting;
}
