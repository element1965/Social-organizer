import type { PrismaClient } from '@so/db';
import { NOTIFICATION_TTL_HOURS } from '@so/shared';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { notifyGoalReached, syncCollectionGoal } from '../src/services/collection-amount.js';
import { createUserWithReferralSlug } from '../src/services/referral-slug.service.js';
import { remainingBudgets } from '../src/services/network.service.js';
import { touchUserNow } from '../src/services/activity.service.js';
import { createTestDatabase } from './test-database.js';

vi.hoisted(() => {
  // Enable only local behavior, even if a developer's shell exports integration settings.
  for (const key of [
    'ADMIN_IDS', 'TELEGRAM_BOT_TOKEN', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY', 'RESEND_API_KEY',
  ]) delete process.env[key];
  process.env.JWT_SECRET = 'local-perf-fixes-test-key';
});

let db: PrismaClient;
let dispose: (() => Promise<void>) | undefined;

beforeAll(async () => {
  ({ db, dispose } = await createTestDatabase());
}, 60_000);
afterAll(async () => dispose?.(), 30_000);

const hour = 60 * 60 * 1000;

/**
 * A Need of $10 by `author` with: two notified people who did not pledge (one already holding a
 * COLLECTION_BLOCKED row from an earlier hold), one pledger, one person who pledged and declined,
 * and a notice row for the author. The pledger's $10 reaches the goal.
 */
async function seedGoal(prefix: string) {
  const id = (name: string) => `${prefix}-${name}`;
  const people = ['author', 'told', 'heldBefore', 'pledger', 'declined'].map(id);
  await db.user.createMany({ data: people.map((p) => ({ id: p, name: p, language: 'en' })) });
  const need = await db.collection.create({
    data: { creatorId: id('author'), type: 'EMERGENCY', amount: 10, status: 'ACTIVE', chatLink: 'https://t.me/perf' },
  });
  const expiresAt = new Date(Date.now() + 24 * hour);
  await db.notification.createMany({
    data: [
      { userId: id('told'), collectionId: need.id, type: 'NEW_COLLECTION', expiresAt, wave: 1 },
      { userId: id('told'), collectionId: need.id, type: 'RE_NOTIFY', expiresAt, wave: 2 },
      { userId: id('heldBefore'), collectionId: need.id, type: 'NEW_COLLECTION', expiresAt, wave: 1 },
      { userId: id('pledger'), collectionId: need.id, type: 'NEW_COLLECTION', expiresAt, wave: 1 },
      { userId: id('declined'), collectionId: need.id, type: 'NEW_COLLECTION', expiresAt, wave: 1 },
      { userId: id('author'), collectionId: need.id, type: 'NEW_OBLIGATION', expiresAt, wave: 1 },
    ],
  });
  const oldExpiry = new Date(Date.now() - hour);
  const earlier = await db.notification.create({
    data: {
      userId: id('heldBefore'), collectionId: need.id, type: 'COLLECTION_BLOCKED',
      status: 'EXPIRED', handshakePath: [], expiresAt: oldExpiry, wave: 0,
    },
  });
  await db.obligation.create({ data: { collectionId: need.id, userId: id('pledger'), amount: 10 } });
  await db.obligation.create({
    data: { collectionId: need.id, userId: id('declined'), amount: 5, unsubscribedAt: new Date() },
  });
  return { need, id, earlier };
}

function blockedRows(collectionId: string) {
  return db.notification.findMany({
    where: { collectionId, type: 'COLLECTION_BLOCKED' },
    orderBy: { userId: 'asc' },
  });
}

function expectGoalNotices(
  rows: Awaited<ReturnType<typeof blockedRows>>,
  id: (name: string) => string,
  earlierId: string,
  startedAt: number,
) {
  expect(rows.map((row) => row.userId)).toEqual([id('heldBefore'), id('told')].sort());
  const ttl = NOTIFICATION_TTL_HOURS * hour;
  for (const row of rows) {
    expect(row).toMatchObject({ status: 'UNREAD', wave: 0, handshakePath: [] });
    // The same expiry as the old per-row upsert: now + TTL, in UTC
    expect(row.expiresAt.getTime()).toBeGreaterThanOrEqual(startedAt + ttl - 1000);
    expect(row.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + ttl + 1000);
    expect(row.updatedAt.getTime()).toBeGreaterThanOrEqual(startedAt - 1000);
  }
  // The earlier hold's row is reopened in place, not duplicated
  expect(rows.find((row) => row.userId === id('heldBefore'))!.id).toBe(earlierId);
}

describe('goal reached notices (PERF-1)', () => {
  it('notifies every notified non-pledger once, reopens an earlier row, skips the author and pledgers', async () => {
    const { need, id, earlier } = await seedGoal('goal');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const startedAt = Date.now();
    await syncCollectionGoal(db, need.id);
    // The set-based statement did the work: no fallback
    expect(log).not.toHaveBeenCalledWith(expect.stringContaining('[GoalReached]'), expect.anything());
    log.mockRestore();

    expect(await db.collection.findUnique({ where: { id: need.id }, select: { status: true } }))
      .toEqual({ status: 'BLOCKED' });
    expectGoalNotices(await blockedRows(need.id), id, earlier.id, startedAt);
    // The open requests were expired first, as before
    expect(await db.notification.count({
      where: { collectionId: need.id, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] }, status: { not: 'EXPIRED' } },
    })).toBe(0);
  });

  it('falls back to the per-person upsert with the same rows when the batch statement fails', async () => {
    const { need, id, earlier } = await seedGoal('fallback');
    const failing = Object.create(db) as PrismaClient;
    Object.defineProperty(failing, '$executeRaw', { value: () => Promise.reject(new Error('batch failed')) });
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const startedAt = Date.now();
    await notifyGoalReached(failing, need.id, id('author'), new Date(Date.now() + NOTIFICATION_TTL_HOURS * hour));
    log.mockRestore();
    expectGoalNotices(await blockedRows(need.id), id, earlier.id, startedAt);
  });
});

describe('budget sync (PERF-2)', () => {
  // One clock for the whole block: the sync keeps its own times in module state
  let clock = 0;
  const advance = (ms: number) => {
    clock += ms;
    vi.setSystemTime(clock);
  };
  beforeAll(() => {
    clock = Date.now();
    vi.useFakeTimers({ toFake: ['Date'], now: clock });
  });
  afterAll(() => {
    vi.useRealTimers();
  });

  it('reads budget changes by budgetUpdatedAt, including a new account, within the sync interval', async () => {
    // The first call loads everything; later calls read only what changed
    await remainingBudgets(db);

    const newcomer = await createUserWithReferralSlug(db, { name: 'newcomer', remainingBudget: 7, monthlyBudget: 7 });
    expect(newcomer.budgetUpdatedAt).not.toBeNull();
    // Another process set a budget: no noteBudgetChanged here, only the columns
    await db.user.create({ data: { id: 'budget-other', name: 'other', language: 'en' } });
    await db.user.update({ where: { id: 'budget-other' }, data: { remainingBudget: 12, budgetUpdatedAt: new Date() } });

    advance(61_000);
    const budgets = await remainingBudgets(db);
    expect(budgets.get(newcomer.id)).toBe(7);
    expect(budgets.get('budget-other')).toBe(12);
  });

  it('is not driven by updatedAt (the heartbeat); the full reload still reads every budget', async () => {
    // Written without budgetUpdatedAt, as no app path does: only the 30-minute reload sees it
    await db.user.create({ data: { id: 'budget-quiet', name: 'quiet', language: 'en', remainingBudget: 3 } });
    await touchUserNow(db, 'budget-quiet');
    advance(61_000);
    expect((await remainingBudgets(db)).get('budget-quiet')).toBeUndefined();
    advance(31 * 60_000);
    expect((await remainingBudgets(db)).get('budget-quiet')).toBe(3);
  });
});
