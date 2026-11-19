import type { PrismaClient } from '@so/db';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/routers/index.js';
import { getAskAccess } from '../src/services/ask-access.service.js';
import { invalidateGraph } from '../src/services/graph-cache.service.js';
import { runReNotify } from '../src/workers/re-notify.worker.js';
import { createTestDatabase } from './test-database.js';

vi.hoisted(() => {
  // Enable only local behavior, even if a developer's shell exports integration settings.
  for (const key of [
    'ADMIN_IDS', 'TELEGRAM_BOT_TOKEN', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY', 'RESEND_API_KEY',
  ]) delete process.env[key];
  process.env.JWT_SECRET = 'local-need-protocol-test-key';
});

let db: PrismaClient;
let dispose: (() => Promise<void>) | undefined;

beforeAll(async () => {
  ({ db, dispose } = await createTestDatabase());
}, 60_000);
afterAll(async () => dispose?.(), 30_000);
afterEach(async () => {
  // Future-time worker runs should only see the Need from the current case.
  if (db) await db.collection.updateMany({ where: { status: 'ACTIVE' }, data: { status: 'CLOSED' } });
});

const hour = 60 * 60 * 1000;

// Adapted from check-connection-counts and check-renotify. The author has a
// direct circle and one chain starting at the first member of that circle.
async function seedNetwork(author: string, direct: number, depth: number, extraAtDepth?: number) {
  const circle = Array.from({ length: direct }, (_, i) => `${author}-b${i + 1}`);
  const chain = [circle[0]!, ...Array.from({ length: depth - 1 }, (_, i) => `${author}-r${i + 2}`)];
  const people = [...circle, ...chain.slice(1)];
  const edges = [...circle.map((id) => [author, id]), ...chain.slice(1).map((id, i) => [chain[i]!, id])];
  if (extraAtDepth !== undefined) {
    const extra = `${author}-extra`;
    people.push(extra);
    edges.push([chain[extraAtDepth - 2]!, extra]);
  }

  await db.user.createMany({
    data: [author, ...people].map((id) => ({ id, name: id, language: 'en', onboardingCompleted: true })),
  });
  // A linked account makes a person eligible for delivery. The token is absent.
  await db.platformAccount.createMany({
    data: people.map((userId) => ({ userId, platform: 'TELEGRAM', platformId: `test-${userId}` })),
  });
  await db.connection.createMany({
    data: edges.map((edge) => {
      const [userAId, userBId] = edge.sort() as [string, string];
      return { userAId, userBId };
    }),
  });
  invalidateGraph([author, ...people]);
  return { circle, chain };
}

function reportNeed(userId: string, amount = 10) {
  const caller = appRouter.createCaller({ db, userId, ip: '127.0.0.1' });
  return caller.collection.create({ type: 'EMERGENCY', amount, chatLink: 'https://t.me/needprotocoltest' });
}

function recipients(collectionId: string, type: 'NEW_COLLECTION' | 'RE_NOTIFY') {
  return db.notification.findMany({
    where: { collectionId, type },
    select: { userId: true, handshakePath: true },
    orderBy: { userId: 'asc' },
  });
}

async function waitForDispatch(people: string[]) {
  // Dispatch runs in the background. Wait for its final recorded side effect.
  await expect.poll(() => db.notifyStats.count({ where: { userId: { in: people }, lastSentAt: { not: null } } }))
    .toBe(people.length);
}

describe('Need access', () => {
  it('refuses four direct connections even with ten people within six handshakes', async () => {
    await seedNetwork('four', 4, 6, 3);
    expect(await getAskAccess(db, 'four', { quick: true })).toMatchObject({ directCount: 4, networkCount: 10 });
    await expect(reportNeed('four')).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/^ASK_LOCKED/) });
  });

  it('refuses nine network members even with five direct connections', async () => {
    await seedNetwork('nine', 5, 5);
    expect(await getAskAccess(db, 'nine', { quick: true })).toMatchObject({ directCount: 5, networkCount: 9 });
    await expect(reportNeed('nine')).rejects.toMatchObject({ code: 'FORBIDDEN', message: expect.stringMatching(/^ASK_LOCKED/) });
  });

  it('opens at five direct and ten network members, counting the sixth handshake', async () => {
    await seedNetwork('ten', 5, 7);
    expect(await getAskAccess(db, 'ten')).toMatchObject({ allowed: true, directCount: 5, networkMet: true });
    const need = await reportNeed('ten', 20);
    const initial = await recipients(need.id, 'NEW_COLLECTION');
    expect(initial).toHaveLength(10);
    expect(initial).toContainEqual({
      userId: 'ten-r6',
      handshakePath: ['ten', 'ten-b1', 'ten-r2', 'ten-r3', 'ten-r4', 'ten-r5', 'ten-r6'],
    });
    await waitForDispatch(initial.map((person) => person.userId));
  });

  it('excludes the seventh handshake from the access count', async () => {
    await seedNetwork('distant', 1, 7);
    expect(await getAskAccess(db, 'distant', { quick: true }))
      .toMatchObject({ allowed: false, directCount: 1, networkCount: 6 });
  });
});

describe('Need notification waves', () => {
  it('notifies the nearest people first, with one reachable recipient per dollar', async () => {
    const { circle, chain } = await seedNetwork('wave', 5, 6, 5);
    const need = await reportNeed('wave', 10);
    const initial = await recipients(need.id, 'NEW_COLLECTION');
    const expected = [...circle, ...chain.slice(1, 5), 'wave-extra'].sort();
    expect(initial.map((person) => person.userId)).toEqual(expected);
    expect(initial).toContainEqual({
      userId: 'wave-r3',
      handshakePath: ['wave', 'wave-b1', 'wave-r2', 'wave-r3'],
    });
    await waitForDispatch(expected);
  });

  it('repeats for the shortfall after 12 hours, then stops at the exact amount', async () => {
    await seedNetwork('repeat', 5, 6, 5);
    // Keep a second untold member in the sixth ring after a one-person repeat wave.
    await db.user.create({ data: { id: 'repeat-spare', name: 'Spare' } });
    await db.platformAccount.create({ data: { userId: 'repeat-spare', platform: 'TELEGRAM', platformId: 'test-repeat-spare' } });
    await db.connection.create({ data: { userAId: 'repeat-r5', userBId: 'repeat-spare' } });
    invalidateGraph(['repeat-r5', 'repeat-spare']);

    const need = await reportNeed('repeat');
    const initial = await recipients(need.id, 'NEW_COLLECTION');
    await waitForDispatch(initial.map((person) => person.userId));
    await db.obligation.create({ data: { collectionId: need.id, userId: 'repeat-b1', amount: 9 } });
    const now = Date.now();
    expect((await runReNotify(db, new Date(now + 11 * hour))).has(need.id)).toBe(false);
    expect((await runReNotify(db, new Date(now + 13 * hour))).get(need.id)).toBe(1);

    const repeat = await recipients(need.id, 'RE_NOTIFY');
    expect(repeat).toHaveLength(1);
    expect(['repeat-r6', 'repeat-spare']).toContain(repeat[0]?.userId);
    expect(initial.map((person) => person.userId)).not.toContain(repeat[0]?.userId);
    await waitForDispatch(repeat.map((person) => person.userId));

    // Leave the Need active to exercise the worker's own amount check.
    await db.obligation.create({ data: { collectionId: need.id, userId: 'repeat-b2', amount: 1 } });
    expect((await runReNotify(db, new Date(now + 26 * hour))).has(need.id)).toBe(false);
    expect(await recipients(need.id, 'RE_NOTIFY')).toEqual(repeat);
  });
});
