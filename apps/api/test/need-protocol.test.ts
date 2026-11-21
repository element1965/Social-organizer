import * as database from '@so/db';
import type { PrismaClient } from '@so/db';
import type { Job } from 'bullmq';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/routers/index.js';
import { touchUserNow } from '../src/services/activity.service.js';
import { getAskAccess } from '../src/services/ask-access.service.js';
import { deleteUserAccount } from '../src/services/account-deletion.service.js';
import { invalidateGraph } from '../src/services/graph-cache.service.js';
import { runInactiveCleanup } from '../src/services/inactive-cleanup.service.js';
import { sendCycleRenewalReminderTg, sendCycleRenewedTg } from '../src/services/notification.service.js';
import { respondToConnectionRequest } from '../src/services/connection-request.service.js';
import { pruneDeliveries } from '../src/services/delivery.service.js';
import { dispatchPendingNeedNotices } from '../src/services/notice-delivery.js';
import { enqueueNeedNotice } from '../src/services/need-delivery-state.js';
import * as notifications from '../src/services/notification.service.js';
import { planWave } from '../src/services/notify-routing.service.js';
import { WEB_APP_URL } from '../src/deployment.js';
import { processCycleClose } from '../src/workers/cycle-close.worker.js';
import { processCycleRenewalReminder } from '../src/workers/cycle-renewal-reminder.worker.js';
import * as workers from '../src/workers/index.js';
import { processTgBroadcast } from '../src/workers/tg-broadcast.worker.js';
import { runReNotify } from '../src/workers/re-notify.worker.js';
import { createTestDatabase, isBlockingTransaction, pauseAfterLockedRead } from './test-database.js';

const { webPushTransport } = vi.hoisted(() => {
  // Enable only local behavior, even if a developer's shell exports integration settings.
  for (const key of [
    'ADMIN_IDS', 'TELEGRAM_BOT_TOKEN', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY', 'RESEND_API_KEY',
  ]) delete process.env[key];
  process.env.JWT_SECRET = 'local-need-protocol-test-key';
  process.env.ADMIN_IDS = 'privacy-admin,sweep-admin';
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  process.env.VAPID_PUBLIC_KEY = 'test-public';
  process.env.VAPID_PRIVATE_KEY = 'test-private';
  return { webPushTransport: vi.fn(async () => ({})) };
});

vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: webPushTransport },
}));

const telegramOk = () => Response.json({ ok: true });
const telegramFailure = (status: number, description = 'Provider failure') => Response.json({ ok: false, description }, { status });
function telegramChat(init?: RequestInit): string | undefined {
  return init?.body ? String(JSON.parse(String(init.body)).chat_id) : undefined;
}
const defaultTelegram = async (input: Parameters<typeof fetch>[0]) => {
  if (new URL(String(input)).hostname !== 'api.telegram.org') throw new Error('Unexpected network request in Need tests');
  return telegramOk();
};
const telegramFetch = vi.fn<typeof fetch>(defaultTelegram);

function sendsTo(id: string) {
  return telegramFetch.mock.calls.filter(([url, init]) => String(url).endsWith('/sendMessage') && telegramChat(init) === id);
}

let db: PrismaClient;
let dispose: (() => Promise<void>) | undefined;

beforeAll(async () => {
  vi.stubGlobal('fetch', telegramFetch);
  ({ db, dispose } = await createTestDatabase());
}, 60_000);
afterAll(async () => {
  vi.unstubAllGlobals();
  await dispose?.();
}, 30_000);
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
  // The linked accounts receive messages through the Telegram stub.
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
  return caller(userId).collection.create({ type: 'EMERGENCY', amount, chatLink: 'https://t.me/needprotocoltest' });
}

function caller(userId: string | null) {
  return appRouter.createCaller({ db, userId, ip: '127.0.0.1' });
}

function recipients(collectionId: string, type: 'NEW_COLLECTION' | 'RE_NOTIFY') {
  return db.notification.findMany({
    where: { collectionId, type },
    select: { userId: true, handshakePath: true },
    orderBy: { userId: 'asc' },
  });
}

async function waitForCloseDrain(collectionId: string) {
  await expect.poll(() => db.notificationDelivery.count({
    where: { eventKey: `need-notice:closed:${collectionId}:0` },
  })).toBe(0);
}

async function waitForDispatch(people: string[]) {
  // Dispatch runs in the background. Wait for its final recorded side effect.
  await expect.poll(
    () => db.notifyStats.count({ where: { userId: { in: people }, lastSentAt: { not: null } } }),
    { timeout: 4_000 },
  ).toBe(people.length);
}

describe('Need concurrency regressions', () => {
  function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
    return { promise, resolve, reject };
  }

  async function setup(name: string, data: Partial<database.Collection> = {}) {
    const author = `race-${name}-author`;
    const member = `race-${name}-member`;
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 20, chatLink: 'https://example.com/chat', ...data },
    });
    return { author, member, need };
  }

  function pauseAfterCommit() {
    const committed = deferred<void>();
    const resume = deferred<void>();
    const transact = db.$transaction.bind(db);
    const spy = vi.spyOn(db, '$transaction').mockImplementationOnce(((...args: Parameters<typeof transact>) =>
      transact(...args).then(async (result) => {
        committed.resolve();
        await resume.promise;
        return result;
      })) as typeof db.$transaction);
    return { committed: committed.promise, resume, restore: () => spy.mockRestore() };
  }

  function holdNeed(id: string, write: (tx: database.Prisma.TransactionClient) => Promise<unknown>) {
    const locked = deferred<number>();
    const resume = deferred<void>();
    const finished = db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM collections WHERE id = ${id} FOR UPDATE`;
      const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
      locked.resolve(backend!.pid);
      await resume.promise;
      await write(tx);
    });
    return { locked: locked.promise, resume: resume.resolve, finished };
  }

  it.each([
    ['lowered', 20, 10, 'ACTIVE', 'BLOCKED'],
    ['raised', 10, 20, 'BLOCKED', 'ACTIVE'],
    ['removed', 10, null, 'BLOCKED', 'ACTIVE'],
  ] as const)('reconciles the %s goal with the pledge committed while the update waits', async (change, before, amount, initial, status) => {
    const { author, member, need } = await setup(`goal-${change}`, {
      amount: before, status: initial, blockedAt: initial === 'BLOCKED' ? new Date() : null,
    });
    const lock = holdNeed(need.id, (tx) =>
      tx.obligation.create({ data: { collectionId: need.id, userId: member, amount: 10 } }));
    const pid = await lock.locked;
    const updated = caller(author).collection.updateAmount({ id: need.id, amount });
    try {
      await expect.poll(() => isBlockingTransaction(db, pid)).toBe(true);
    } finally {
      lock.resume();
      await lock.finished;
    }
    expect(await updated).toMatchObject({ amount, status, blockedAt: status === 'BLOCKED' ? expect.any(Date) : null });
    if (status === 'BLOCKED') {
      await expect.poll(() => db.notificationDelivery.count({
        where: { userId: author, eventKey: { startsWith: `goal:${need.id}:` } },
      })).toBe(1);
    }
  });

  it('commits a reached goal with the pledge before another pledge can be accepted', async () => {
    const { author, member, need } = await setup('second-pledge');
    const gate = pauseAfterCommit();
    const first = caller(member).obligation.create({ collectionId: need.id, amount: 20 });
    try {
      await gate.committed;
      await expect(caller(author).obligation.create({ collectionId: need.id, amount: 1 }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    } finally {
      gate.resume.resolve();
      await first;
      gate.restore();
    }
    expect(await db.obligation.count({ where: { collectionId: need.id } })).toBe(1);
  });

  it('rejects a new SOS connection when the Need closes after the initial read', async () => {
    const { author, member, need } = await setup('sos');
    const find = db.collection.findUnique.bind(db.collection);
    const snapshot = vi.spyOn(db.collection, 'findUnique').mockImplementationOnce((args) =>
      find(args).then(async (row) => {
        await caller(author).collection.close({ id: need.id });
        return row;
      }) as ReturnType<typeof find>,
    );
    try {
      await expect(caller(member).invite.acceptSos({ collectionId: need.id })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await db.connection.count({ where: { viaCollectionId: need.id } })).toBe(0);
    } finally {
      snapshot.mockRestore();
    }
  });

  it('does not insert a repeat wave when closure commits after its recipient snapshot', async () => {
    const author = 'race-wave';
    const { circle: [member] } = await seedNetwork(author, 1, 1);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 20, chatLink: 'https://example.com/chat' },
    });
    const find = db.notifyStats.findMany.bind(db.notifyStats);
    const snapshot = vi.spyOn(db.notifyStats, 'findMany').mockImplementationOnce((args) =>
      find(args).then(async (rows) => {
        await caller(author).collection.close({ id: need.id });
        return rows;
      }) as ReturnType<typeof find>,
    );
    try {
      expect(await notifications.sendCollectionNotifications(db, need.id, author, 'RE_NOTIFY', 2, 1)).toBe(0);
      expect(await db.notification.count({ where: { collectionId: need.id, userId: member } })).toBe(0);
    } finally {
      snapshot.mockRestore();
    }
  });

  it.each(['SOS', 'repeat wave'] as const)('blocks a concurrent closure just after the %s Need read', async (action) => {
    const author = action === 'SOS' ? 'locked-sos-author' : 'locked-wave-author';
    const { circle: [member] } = await seedNetwork(author, 1, 1);
    const need = await db.collection.create({ data: { creatorId: author, type: 'EMERGENCY', amount: 20, chatLink: 'https://example.test/chat' } });
    if (action === 'SOS') {
      await db.connection.deleteMany({ where: { OR: [{ userAId: member }, { userBId: member }] } });
    }

    const gate = pauseAfterLockedRead(db, need.id);
    const first = action === 'SOS'
      ? caller(member!).invite.acceptSos({ collectionId: need.id })
      : notifications.sendCollectionNotifications(db, need.id, author, 'RE_NOTIFY', 2, 1);
    let close: ReturnType<ReturnType<typeof caller>['collection']['close']> | undefined;
    try {
      const pid = await Promise.race([gate.read, first.then(() => { throw new Error('Operation did not read the locked Need'); })]);
      close = caller(author).collection.close({ id: need.id });
      await expect.poll(() => isBlockingTransaction(db, pid)).toBe(true);
    } finally {
      gate.resume();
      gate.restore();
      await first;
      await close;
      await waitForCloseDrain(need.id);
    }
    if (action === 'SOS') {
      expect(await db.connection.count({ where: { viaCollectionId: need.id } })).toBe(1);
    } else {
      await expect.poll(() => db.notificationDelivery.count({
        where: { eventKey: `need-notice:repeat:${need.id}:2` },
      })).toBe(0);
      expect(await db.notification.count({ where: { collectionId: need.id, type: 'COLLECTION_CLOSED' } })).toBe(1);
    }
  });

  it('uses the user locks before the pending row for both ordinary and SOS acceptance', async () => {
    const { author, member, need } = await setup('accept-order');
    const pending = await db.pendingConnection.create({ data: { fromUserId: author, toUserId: member } });
    const gate = pauseAfterLockedRead(db, member);
    const ordinary = respondToConnectionRequest(db, pending.id, member, 'accept');
    let sos: ReturnType<ReturnType<typeof caller>['invite']['acceptSos']> | undefined;
    try {
      const pid = await Promise.race([gate.read, ordinary.then(() => { throw new Error('Acceptance did not lock the pair'); })]);
      sos = caller(member).invite.acceptSos({ collectionId: need.id });
      await expect.poll(() => isBlockingTransaction(db, pid)).toBe(true);
      // Ordinary acceptance holds the pair locks; the pending row must still be available.
      await db.$queryRaw`SELECT id FROM pending_connections WHERE id = ${pending.id} FOR UPDATE NOWAIT`;
    } finally {
      gate.resume();
      gate.restore();
      await Promise.all([ordinary, sos]);
    }
    expect(await ordinary).toMatchObject({ outcome: 'accepted' });
    expect(await sos).toMatchObject({ alreadyConnected: true });
    expect(await db.connection.count({ where: { userAId: author, userBId: member } })).toBe(1);
  });

  it('trims a repeat wave nearest first after a pledge commits during planning', async () => {
    const author = 'race-wave-budget';
    const { circle: [nearest] } = await seedNetwork(author, 1, 10);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 10, chatLink: 'https://example.test/chat', createdAt: new Date(Date.now() - 13 * hour) },
    });
    const contributor = 'race-wave-budget-contributor';
    await db.user.create({ data: { id: contributor, name: contributor } });
    const find = db.notifyStats.findMany.bind(db.notifyStats);
    const snapshot = vi.spyOn(db.notifyStats, 'findMany').mockImplementationOnce((args) =>
      find(args).then(async (rows) => {
        await caller(contributor).obligation.create({ collectionId: need.id, amount: 9 });
        return rows;
      }) as ReturnType<typeof find>,
    );
    try {
      expect((await runReNotify(db)).get(need.id)).toBe(1);
      expect(await recipients(need.id, 'RE_NOTIFY')).toEqual([{ userId: nearest, handshakePath: [author, nearest] }]);
    } finally {
      snapshot.mockRestore();
    }
  });

  it('prunes old receipts but lets the drainer retire an obsolete pending notice', async () => {
    const { member, need } = await setup('notice-retention', { status: 'CLOSED' });
    const pending = `need-notice:reminder:${need.id}:1`;
    const old = new Date(Date.now() - 90 * 24 * hour);
    await db.notificationDelivery.createMany({ data: [pending, 'old-receipt'].map((eventKey) => ({
      userId: member, eventKey, createdAt: old, channel: 'APP',
    })) });
    await pruneDeliveries(db);
    expect(await db.notificationDelivery.findMany({ where: { userId: member }, select: { eventKey: true } }))
      .toEqual([{ eventKey: pending }]);

    await dispatchPendingNeedNotices(db, ['reminder'], need.id);
    expect(await db.notificationDelivery.count({ where: { userId: member } })).toBe(0);
  });

  it('backs off transient Telegram failures, then receipts success or retires after three attempts', async () => {
    const { member, need } = await setup('notice-failed', { status: 'CLOSED' });
    const exhausted = 'notice-retry-exhausted';
    await db.user.create({ data: { id: exhausted, name: exhausted } });
    const users = [member, exhausted];
    await db.platformAccount.createMany({ data: users.map((userId) => ({ userId, platform: 'TELEGRAM', platformId: userId })) });
    await enqueueNeedNotice(db, 'closed', need.id, 0, users);
    const pending = `need-notice:closed:${need.id}:0`;
    const receipt = `col:${need.id}:closed`;
    const drain = () => dispatchPendingNeedNotices(db, ['closed'], need.id);
    const readKeys = (userId: string) => db.notificationDelivery.findMany({ where: { userId }, select: { eventKey: true } });
    let recover = false;
    telegramFetch.mockImplementation(async (url, init) => {
      const chat = telegramChat(init);
      if (chat === exhausted || (chat === member && !recover)) return telegramFailure(503);
      return defaultTelegram(url);
    });
    try {
      await drain();
      expect(await readKeys(member)).toEqual([{ eventKey: pending }]);
      expect(await readKeys(exhausted)).toEqual([{ eventKey: pending }]);
      await drain();
      expect(sendsTo(member)).toHaveLength(1);
      const makeDue = () => db.notificationDelivery.updateMany({ where: { eventKey: pending }, data: { createdAt: new Date(0) } });
      recover = true;
      await makeDue();
      await drain();
      expect(await readKeys(member)).toEqual([{ eventKey: receipt }]);
      expect(await readKeys(exhausted)).toEqual([{ eventKey: pending }]);
      await makeDue();
      await drain();
      await drain();
      expect(await readKeys(exhausted)).toEqual([]);
      expect(sendsTo(exhausted)).toHaveLength(3);
    } finally {
      telegramFetch.mockImplementation(defaultTelegram);
    }
  });

  it.each([401, 403])('retires a permanent Telegram failure (%s) without a receipt', async (status) => {
    const { member, need } = await setup(`notice-retired-${status}`, { status: 'CLOSED' });
    await db.platformAccount.create({ data: { userId: member, platform: 'TELEGRAM', platformId: member } });
    await enqueueNeedNotice(db, 'closed', need.id, 0, [member]);
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    telegramFetch.mockImplementation(async (url, init) => telegramChat(init) === member
      ? telegramFailure(status, status === 403 ? 'Forbidden: bot was blocked by the user' : 'Unauthorized')
      : defaultTelegram(url));
    try {
      await dispatchPendingNeedNotices(db, ['closed'], need.id);
      expect(await db.notificationDelivery.count({ where: { userId: member } })).toBe(0);
      expect(sendsTo(member)).toHaveLength(1);
    } finally {
      getDb.mockRestore();
      telegramFetch.mockImplementation(defaultTelegram);
    }
  });

  it('records push delivery only when at least one device accepts the handoff', async () => {
    const { member, need } = await setup('notice-push', { status: 'CLOSED' });
    const endpoint = 'https://fcm.googleapis.com/fcm/send/test-notice';
    await db.pushSubscription.createMany({ data: ['a', 'b'].map((suffix) => ({
      userId: member, endpoint: endpoint + suffix, p256dh: 'test', auth: 'test',
    })) });
    await enqueueNeedNotice(db, 'closed', need.id, 0, [member]);
    webPushTransport.mockRejectedValueOnce({ statusCode: 503 }).mockRejectedValueOnce({ statusCode: 503 });
    await dispatchPendingNeedNotices(db, ['closed'], need.id);
    const receipt = `col:${need.id}:closed`;
    const pending = `need-notice:closed:${need.id}:0`;
    expect(await db.notificationDelivery.findMany({ where: { userId: member }, select: { eventKey: true } }))
      .toEqual([{ eventKey: pending }]);
    await db.notificationDelivery.updateMany({ where: { eventKey: pending }, data: { createdAt: new Date(0) } });
    webPushTransport.mockRejectedValueOnce({ statusCode: 410 });
    await dispatchPendingNeedNotices(db, ['closed'], need.id);
    expect(await db.notificationDelivery.findMany({ where: { userId: member }, select: { eventKey: true, channel: true } }))
      .toEqual([{ eventKey: receipt, channel: 'APP' }]);
    expect(await db.pushSubscription.count({ where: { userId: member } })).toBe(1);
  });

  it('fences out a sender whose lease expired before the provider call', async () => {
    const { member, need } = await setup('notice-expired-lease', { status: 'CLOSED' });
    await db.platformAccount.create({ data: { userId: member, platform: 'TELEGRAM', platformId: member } });
    await enqueueNeedNotice(db, 'closed', need.id, 0, [member]);
    const pending = `need-notice:closed:${need.id}:0`;
    const receipt = `col:${need.id}:closed`;
    const leased = deferred<void>();
    const resume = deferred<void>();
    const find = db.notificationDelivery.findUnique.bind(db.notificationDelivery);
    let paused = false;
    const query = vi.spyOn(db.notificationDelivery, 'findUnique').mockImplementation((args) =>
      find(args).then(async (row) => {
        if (!paused && args.where.userId_eventKey?.eventKey === receipt) {
          paused = true;
          leased.resolve();
          await resume.promise;
        }
        return row;
      }) as ReturnType<typeof find>,
    );
    const drain = () => dispatchPendingNeedNotices(db, ['closed'], need.id);
    const original = drain();
    try {
      await leased.promise;
      await db.notificationDelivery.updateMany({ where: { eventKey: pending }, data: { createdAt: new Date(0) } });
      await drain();
      expect(sendsTo(member)).toHaveLength(1);
    } finally {
      resume.resolve();
      await original;
      query.mockRestore();
    }
    expect(sendsTo(member)).toHaveLength(1);
    expect(await db.notificationDelivery.findMany({ where: { userId: member }, select: { eventKey: true } }))
      .toEqual([{ eventKey: receipt }]);
  });

  it('queues one stable job per recipient and only receipts eligible handoffs in the worker', async () => {
    const author = 'queue-repeat-author';
    const { circle } = await seedNetwork(author, 26, 1);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 26, chatLink: 'https://example.test/chat' },
    });
    const jobs: ReturnType<typeof workers.tgJobs>[] = [];
    const enqueue = vi.spyOn(workers, 'enqueueTgBroadcast').mockImplementation(async (messages, kind = 'wave') => {
      jobs.push(workers.tgJobs(messages, kind));
    });
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    process.env.REDIS_URL = 'redis://unused-in-test';
    const finalKey = `col:${need.id}:new`;
    const pendingKey = `need-notice:repeat:${need.id}:2`;
    try {
      expect(await notifications.sendCollectionNotifications(db, need.id, author, 'RE_NOTIFY', 2, 26)).toBe(26);
      await expect.poll(() => jobs.length).toBe(1);
      await dispatchPendingNeedNotices(db, ['repeat'], need.id);
      expect(jobs).toHaveLength(2);
      const jobIds = (batch: typeof jobs[number]) => batch.map(({ opts }) => opts.jobId);
      expect(new Set(jobIds(jobs[0]!)).size).toBe(26);
      expect(jobIds(jobs[0]!).every(Boolean)).toBe(true);
      expect(jobIds(jobs[0]!).sort()).toEqual(jobIds(jobs[1]!).sort());
      expect(await db.notificationDelivery.count({ where: { eventKey: finalKey } })).toBe(0);
      expect(await db.notifyStats.count({ where: { userId: { in: circle }, lastSentAt: { not: null } } })).toBe(0);

      const run = (who: string) => processTgBroadcast(jobs[0]!.find(
        ({ data }) => data.messages[0]?.delivery?.userId === who,
      ) as unknown as Parameters<typeof processTgBroadcast>[0]);
      const [sent, transient, reached, closed] = circle as [string, string, string, string, ...string[]];
      await Promise.all([run(sent), run(sent)]);
      await run(sent);
      expect(sendsTo(`test-${sent}`)).toHaveLength(1);
      expect(await db.notifyStats.findUnique({ where: { userId: sent } })).toMatchObject({ sent: 1 });
      telegramFetch.mockImplementation(async (url, init) => telegramChat(init) === `test-${transient}`
        ? telegramFailure(503) : defaultTelegram(url));
      await run(transient);
      expect(await db.notificationDelivery.count({ where: { eventKey: pendingKey, userId: transient } })).toBe(1);

      // Exercise the goal check even when the stored status is still ACTIVE.
      const pledge = await db.obligation.create({ data: { collectionId: need.id, userId: author, amount: 26 } });
      await run(reached);
      expect(sendsTo(`test-${reached}`)).toHaveLength(0);
      expect(await db.notificationDelivery.count({ where: { eventKey: pendingKey, userId: reached } })).toBe(0);
      await db.obligation.delete({ where: { id: pledge.id } });
      await db.collection.update({ where: { id: need.id }, data: { status: 'CLOSED' } });
      await run(closed);
      expect(sendsTo(`test-${closed}`)).toHaveLength(0);
      expect(await db.notificationDelivery.count({ where: { eventKey: pendingKey, userId: closed } })).toBe(0);
      expect(await db.notificationDelivery.findMany({ where: { eventKey: finalKey }, select: { userId: true } }))
        .toEqual([{ userId: sent }]);
    } finally {
      delete process.env.REDIS_URL;
      enqueue.mockRestore();
      getDb.mockRestore();
      telegramFetch.mockImplementation(defaultTelegram);
    }
  });

  it('uses guarded direct sends if a large Telegram enqueue returns an error', async () => {
    const author = 'queue-error-author';
    const { circle } = await seedNetwork(author, 26, 1);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 26, chatLink: 'https://example.test/chat' },
    });
    const enqueue = vi.spyOn(workers, 'enqueueTgBroadcast').mockRejectedValue(new Error('Queue response lost'));
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    process.env.REDIS_URL = 'redis://unused-in-test';
    try {
      expect(await notifications.sendCollectionNotifications(db, need.id, author, 'RE_NOTIFY', 2, 26)).toBe(26);
      await waitForDispatch(circle);
      const [message] = enqueue.mock.calls[0]![0];
      // A Redis job may still run later if the server accepted the enqueue and the reply was lost.
      await processTgBroadcast({ data: { messages: [message!] } } as Parameters<typeof processTgBroadcast>[0]);
      expect(sendsTo(message!.telegramId)).toHaveLength(1);
      expect(await db.notificationDelivery.count({ where: { eventKey: `col:${need.id}:new` } })).toBe(26);
    } finally {
      delete process.env.REDIS_URL;
      enqueue.mockRestore();
      getDb.mockRestore();
    }
  }, 10_000);

  it('serializes request handoffs for one recipient and rechecks the cap as queued work drains', async () => {
    const { author, member, need: first } = await setup('queued-request-cap');
    await db.platformAccount.create({ data: { userId: member, platform: 'TELEGRAM', platformId: member } });
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    const sending = deferred<void>();
    const resume = deferred<void>();
    const makeJob = async (id: string) => {
      await db.notification.create({ data: {
        collectionId: id, userId: member, type: 'RE_NOTIFY', wave: 2, expiresAt: new Date(Date.now() + hour),
      } });
      await enqueueNeedNotice(db, 'repeat', id, 2, [member]);
      return {
        data: { messages: [{
          telegramId: member, text: 'Test request',
          delivery: { userId: member, eventKey: `col:${id}:new`, notice: { type: 'repeat', collectionId: id, wave: 2 } },
        }] },
      } as Parameters<typeof processTgBroadcast>[0];
    };
    const [second, third] = await Promise.all([1, 2].map(() => db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 20, chatLink: 'https://example.test/chat' },
    })));
    const [one, two, three] = await Promise.all([first.id, second!.id, third!.id].map(makeJob));
    let firstCall = true;
    telegramFetch.mockImplementation(async (url, init) => {
      if (telegramChat(init) === member && firstCall) {
        firstCall = false;
        sending.resolve();
        await resume.promise;
      }
      return defaultTelegram(url);
    });
    const original = processTgBroadcast(one!);
    try {
      await Promise.race([sending.promise, original]);
      await processTgBroadcast(two!);
      expect(sendsTo(member)).toHaveLength(1);
      resume.resolve();
      await original;
      await processTgBroadcast(two!);
      await processTgBroadcast(three!);
      expect(sendsTo(member)).toHaveLength(2);
      expect(await db.notificationDelivery.count({ where: { userId: member, eventKey: { endsWith: ':new' } } })).toBe(2);
      expect(await db.notificationDelivery.count({ where: { userId: member, eventKey: { startsWith: 'need-notice:' } } })).toBe(0);
    } finally {
      resume.resolve();
      await original;
      getDb.mockRestore();
      telegramFetch.mockImplementation(defaultTelegram);
    }
  });

  it('suppresses the external request if the Need closes after the wave commits', async () => {
    const author = 'race-wave-delivery';
    const { circle: [member] } = await seedNetwork(author, 1, 1);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount: 20, chatLink: 'https://example.com/chat' },
    });
    const claimed = deferred<void>();
    const resume = deferred<void>();
    const findReceipt = db.notificationDelivery.findUnique.bind(db.notificationDelivery);
    const receipt = vi.spyOn(db.notificationDelivery, 'findUnique').mockImplementation((args) =>
      findReceipt(args).then(async (row) => {
        if (args.where.userId_eventKey?.eventKey === `col:${need.id}:new`) {
          claimed.resolve();
          await resume.promise;
        }
        return row;
      }) as ReturnType<typeof findReceipt>,
    );
    try {
      expect(await notifications.sendCollectionNotifications(db, need.id, author, 'RE_NOTIFY', 2, 1)).toBe(1);
      await claimed.promise;
      await caller(author).collection.close({ id: need.id });
      resume.resolve();
      await expect.poll(() => db.notificationDelivery.count({
        where: { eventKey: `need-notice:repeat:${need.id}:2` },
      })).toBe(0);
      await waitForCloseDrain(need.id);
      expect(sendsTo(`test-${member}`).map(([, init]) => JSON.parse(String(init?.body)).text))
        .toEqual([expect.stringContaining('Need closed')]);
      expect(await db.notificationDelivery.count({ where: { userId: member, eventKey: `col:${need.id}:new` } })).toBe(0);
      expect(await db.notification.count({ where: { collectionId: need.id, userId: member, type: 'COLLECTION_CLOSED' } }))
        .toBe(1);
    } finally {
      resume.resolve();
      receipt.mockRestore();
    }
  });

  it.each(['start', 'reminder', 'closed'] as const)('recovers the external %s notice after the notice transaction commits', async (event) => {
    const daysOld = event === 'start' ? REGULAR_CYCLE_DAYS + 1 : REGULAR_CYCLE_DAYS - 2.5;
    const { author, member, need } = await setup(`restart-${event}`, {
      type: 'REGULAR', currentCycleStart: new Date(Date.now() - daysOld * 24 * hour),
    });
    await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 5 } });
    await db.platformAccount.create({ data: { userId: member, platform: 'TELEGRAM', platformId: member } });
    if (event === 'closed') {
      await db.notification.create({
        data: { collectionId: need.id, userId: member, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + hour) },
      });
    }
    const run = event === 'reminder' ? processCycleRenewalReminder : processCycleClose;
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    const gate = pauseAfterCommit();
    const stopped = new Error('Stopped after commit');
    const interrupted = event === 'closed' ? caller(author).collection.close({ id: need.id }) : run({} as Job);
    const checked = expect(interrupted).rejects.toThrow(stopped.message);
    try {
      await gate.committed;
      const type = event === 'start' ? 'CYCLE_RENEWED' : event === 'reminder' ? 'CYCLE_RENEWAL_REMINDER' : 'COLLECTION_CLOSED';
      expect(await db.notification.count({ where: { collectionId: need.id, userId: member, type } })).toBe(1);
      expect(sendsTo(member)).toHaveLength(0);
      gate.resume.reject(stopped);
      await checked;
      const transport = deferred<void>();
      const sending = deferred<void>();
      telegramFetch.mockImplementation(async (url, init) => {
        if (telegramChat(init) === member) {
          sending.resolve();
          await transport.promise;
        }
        return defaultTelegram(url);
      });
      const resumed = run({} as Job);
      try {
        await Promise.race([sending.promise, resumed]);
        await run({} as Job);
      } finally {
        transport.resolve();
        await resumed;
      }
      await run({} as Job);
      const key = event === 'closed' ? `col:${need.id}:closed` : `cycle:${need.id}:${event === 'start' ? 2 : 1}:${event}`;
      expect(await db.notificationDelivery.count({ where: { userId: member, eventKey: key } })).toBe(1);
      expect(sendsTo(member)).toHaveLength(1);
    } finally {
      gate.resume.reject(stopped);
      await interrupted.catch(() => {});
      gate.restore();
      getDb.mockRestore();
      telegramFetch.mockImplementation(defaultTelegram);
    }
  });

  it.each(['pledge', 'closure'] as const)('orders account deletion after an in-flight %s', async (action) => {
    const { author, member, need } = await setup(`delete-${action}`);
    await db.connection.create({ data: { userAId: author, userBId: member } });
    const pledge = (tx: database.Prisma.TransactionClient) =>
      tx.obligation.create({ data: { collectionId: need.id, userId: author, amount: 5 } });
    if (action === 'closure') await pledge(db);
    const lock = holdNeed(need.id, (tx) => action === 'pledge' ? pledge(tx) :
      tx.collection.update({ where: { id: need.id }, data: { status: 'CLOSED' } }));
    const pid = await lock.locked;
    const deleted = deleteUserAccount(db, author);
    let addedNeedId: string | undefined;
    try {
      await expect.poll(() => isBlockingTransaction(db, pid)).toBe(true);
      if (action === 'pledge') {
        const added = await db.collection.create({
          data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' },
        });
        addedNeedId = added.id;
      }
    } finally {
      lock.resume();
      await lock.finished;
    }
    await expect(deleted).resolves.toEqual({ mode: 'soft' });
    expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } }))
      .toMatchObject({ status: action === 'pledge' ? 'CANCELLED' : 'CLOSED' });
    expect(await db.obligation.count({ where: { collectionId: need.id, userId: author } }))
      .toBe(action === 'closure' ? 1 : 0);
    if (addedNeedId) {
      expect(await db.collection.findUniqueOrThrow({ where: { id: addedNeedId } })).toMatchObject({ status: 'CANCELLED' });
    }
  });
});

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

describe('Need participant visibility', () => {
  it('keeps the inviter’s active and withdrawn amounts out of public invite responses', async () => {
    const [inviter, author] = ['invite-private', 'invite-private-author'];
    await db.user.createMany({ data: [inviter, author].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    await db.obligation.createMany({ data: [
      { collectionId: need.id, userId: inviter, amount: 71 },
      { collectionId: need.id, userId: inviter, amount: 39, unsubscribedAt: new Date() },
    ] });
    const { token } = await caller(inviter).invite.generate();
    const guest = caller(null);
    for (const key of [token, inviter]) {
      const invite = await guest.invite.getByToken({ token: key });
      expect(invite).toMatchObject({ networkCount: 0, inviter: { id: inviter } });
      expect(invite).not.toHaveProperty('totalIntentions');
    }
  });

  it('changes only the author’s pulse when a received mark is toggled', async () => {
    const [author, participant] = ['pulse-author', 'pulse-participant'];
    await db.user.createMany({ data: [author, participant].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({
      data: { collectionId: need.id, userId: participant, amount: 4, createdAt: new Date(Date.now() - hour) },
    });
    const owner = caller(author);
    const member = caller(participant);
    const before = await member.notification.pulse();
    expect(before.participating).toMatchObject({ count: 1, pledgeAt: row.createdAt.getTime() });
    expect((await owner.notification.pulse()).mine).toMatchObject({ confirmed: 0 });
    const mark = { collectionId: need.id, cycleNumber: need.cycleNumber, obligationIds: [row.id] };
    await owner.obligation.setPaid({ ...mark, paid: true });
    expect(await member.notification.pulse()).toEqual(before);
    expect(before.participating).not.toHaveProperty('confirmed');
    const marked = (await owner.notification.pulse()).mine;
    expect(marked).toMatchObject({ confirmed: 1 });
    expect(marked?.pledgeAt).toBeGreaterThan(row.createdAt.getTime());
    await owner.obligation.setPaid({ ...mark, paid: false });
    expect(await member.notification.pulse()).toEqual(before);
    expect((await owner.notification.pulse()).mine).toMatchObject({ confirmed: 0 });
  });

  it('withdraws every active Participation from the Need page in one request', async () => {
    const [author, member, other] = ['withdraw-author', 'withdraw-member', 'withdraw-other'];
    await db.user.createMany({ data: [author, member, other].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', amount: 10, status: 'BLOCKED', chatLink: 'https://example.com/chat' },
    });
    await db.obligation.createMany({ data: [
      { collectionId: need.id, userId: member, amount: 4, isSubscription: true },
      { collectionId: need.id, userId: member, amount: 5 },
      { collectionId: need.id, userId: other, amount: 3 },
    ] });

    const viewer = caller(member);
    expect(await viewer.obligation.unsubscribeFromCollection({ collectionId: need.id })).toEqual({ ok: true });
    expect(await viewer.collection.getById({ id: need.id })).toMatchObject({
      status: 'ACTIVE', currentAmount: 3, participantCount: 1, chatLink: null,
    });
    const rows = await db.obligation.findMany({ where: { collectionId: need.id, userId: member } });
    expect(rows.map((row) => row.unsubscribedAt)).toEqual([expect.any(Date), expect.any(Date)]);
    expect(rows[0]?.unsubscribedAt).toEqual(rows[1]?.unsubscribedAt);
  });

  it('returns success when the Need page repeats a completed withdrawal', async () => {
    const [author, member] = ['repeat-withdraw-author', 'repeat-withdraw-member'];
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'EMERGENCY', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 4 } });
    const viewer = caller(member);
    expect(await viewer.obligation.unsubscribeFromCollection({ collectionId: need.id })).toEqual({ ok: true });
    const withdrawn = await db.obligation.findUniqueOrThrow({ where: { id: row.id } });
    expect(await viewer.obligation.unsubscribeFromCollection({ collectionId: need.id })).toEqual({ ok: true });
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toEqual(withdrawn);
  });

  it('keeps marked participants in the closed summary through both withdrawal procedures', async () => {
    const [author, member] = ['closed-withdraw-author', 'closed-withdraw-member'];
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({
      data: { collectionId: need.id, userId: member, amount: 7, isSubscription: true },
    });
    const owner = caller(author);
    const viewer = caller(member);
    await owner.obligation.setPaid({ collectionId: need.id, cycleNumber: need.cycleNumber, obligationIds: [row.id], paid: true });
    await owner.collection.close({ id: need.id });
    const closed = { code: 'BAD_REQUEST', message: 'Collection is not open' };
    const summary = { status: 'CLOSED', currentAmount: 7, participantCount: 1, obligations: [
      expect.objectContaining({ id: row.id, amount: 7, confirmedAt: expect.any(Date) }),
    ] };
    for (const withdraw of [
      () => viewer.obligation.unsubscribe({ obligationId: row.id }),
      () => viewer.obligation.unsubscribeFromCollection({ collectionId: need.id }),
    ]) {
      await expect(withdraw()).rejects.toMatchObject(closed);
      expect(await owner.collection.getById({ id: need.id })).toMatchObject(summary);
    }
  });

  it('rejects a paid write when closure commits before the Need lock', async () => {
    const [author, member] = ['paid-race-author', 'paid-race-member'];
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 7 } });
    const owner = caller(author);
    const mark = { collectionId: need.id, cycleNumber: need.cycleNumber, obligationIds: [row.id] };
    expect(await owner.obligation.setPaid({ ...mark, paid: false })).toEqual({ changed: 0 });

    const transact = db.$transaction.bind(db);
    const startTransaction = vi.spyOn(db, '$transaction').mockImplementationOnce(((operation: Parameters<typeof transact>[0]) =>
      owner.collection.close({ id: need.id }).then(() => transact(operation))
    ) as typeof db.$transaction);
    try {
      await expect(owner.obligation.setPaid({ ...mark, paid: true }))
        .rejects.toMatchObject({ code: 'BAD_REQUEST', message: 'Collection is not open' });
    } finally {
      startTransaction.mockRestore();
    }
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ confirmedAt: null });
  });

  it('rejects marks, Undo, and acknowledgements from a previous cycle', async () => {
    const [author, member] = ['cycle-conflict-author', 'cycle-conflict-member'];
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: {
        creatorId: author, type: 'REGULAR', cycleNumber: 2, amount: 10, chatLink: 'https://example.com/chat',
        currentCycleStart: new Date(Date.now() - REGULAR_CYCLE_DAYS * 24 * hour - hour),
      },
    });
    const [row, withdrawn] = await Promise.all([
      db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 7, confirmedAt: new Date() } }),
      db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 4, unsubscribedAt: new Date() } }),
    ]);
    const owner = caller(author).obligation;
    const viewer = caller(member).obligation;
    const displayed = { collectionId: need.id, cycleNumber: 2 };
    const current = { ...displayed, cycleNumber: 3 };
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    try {
      await processCycleClose({} as Job);
    } finally {
      getDb.mockRestore();
    }
    expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject({ cycleNumber: 3 });
    expect(await db.obligation.findUnique({ where: { id: withdrawn.id } })).toBeNull();

    const conflict = { code: 'CONFLICT' };
    await expect(owner.setPaid({ ...displayed, obligationIds: [row.id], paid: true })).rejects.toMatchObject(conflict);
    await expect(owner.setPaid({ ...displayed, obligationIds: [withdrawn.id], paid: false })).rejects.toMatchObject(conflict);
    await expect(owner.confirmPayment({ ...displayed, obligationId: row.id })).rejects.toMatchObject(conflict);
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ confirmedAt: null });
    await expect(owner.setPaid({ ...current, obligationIds: [row.id], paid: true })).resolves.toEqual({ changed: 1 });
    await expect(owner.setPaid({ ...displayed, obligationIds: [row.id], paid: false })).rejects.toMatchObject(conflict);
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ confirmedAt: expect.any(Date) });

    const pledge = { obligationId: row.id, amount: 11 };
    await expect(viewer.confirmCycle(displayed)).rejects.toMatchObject(conflict);
    await expect(viewer.confirmCycle({ ...displayed, pledge })).rejects.toMatchObject(conflict);
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ amount: 7 });
    const acknowledgements = { collectionId: need.id, type: 'CYCLE_RENEWED', status: 'RESPONDED' } as const;
    expect(await db.notification.count({ where: acknowledgements })).toBe(0);

    // Force the acknowledgement write to fail so an independently committed edit would remain visible.
    await db.$executeRaw`
      ALTER TABLE notifications ADD CONSTRAINT test_reject_cycle_ack
      CHECK (NOT ("type" = 'CYCLE_RENEWED' AND "status" = 'RESPONDED')) NOT VALID
    `;
    try {
      await expect(viewer.confirmCycle({ ...current, pledge })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ amount: 7 });
    } finally {
      await db.$executeRaw`ALTER TABLE notifications DROP CONSTRAINT test_reject_cycle_ack`;
    }

    // A failure applying the goal hold must also roll back the pledge and acknowledgement.
    await db.$executeRaw`
      ALTER TABLE collections ADD CONSTRAINT test_reject_goal_hold CHECK ("status" <> 'BLOCKED') NOT VALID
    `;
    try {
      await expect(viewer.confirmCycle({ ...current, pledge })).rejects.toMatchObject({ code: 'INTERNAL_SERVER_ERROR' });
      expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ amount: 7 });
      expect(await db.notification.count({ where: acknowledgements })).toBe(0);
    } finally {
      await db.$executeRaw`ALTER TABLE collections DROP CONSTRAINT test_reject_goal_hold`;
    }

    await expect(viewer.confirmCycle({ ...current, pledge })).resolves.toEqual({ ok: true });
    expect(await db.obligation.findUniqueOrThrow({ where: { id: row.id } })).toMatchObject({ amount: 11 });
    expect(await db.notification.findMany({ where: acknowledgements })).toMatchObject([{ userId: member, wave: 3 }]);
    expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject({ status: 'BLOCKED' });
  });

  it('commits the cycle pledge and goal hold even when notification delivery fails', async () => {
    const [author, member, observer] = ['goal-failure-author', 'goal-failure-member', 'goal-failure-observer'];
    await db.user.createMany({ data: [author, member, observer].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: {
        creatorId: author, type: 'REGULAR', cycleNumber: 2, currentCycleStart: new Date(), amount: 10,
        chatLink: 'https://example.com/chat',
      },
    });
    const pledge = await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 7 } });
    const notice = await db.notification.create({
      data: { collectionId: need.id, userId: observer, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + hour) },
    });

    const deliveryError = new Error('Forced notification delivery failure');
    const batch = vi.spyOn(db, '$executeRaw').mockRejectedValueOnce(deliveryError);
    const recipients = vi.spyOn(db.notification, 'findMany').mockRejectedValueOnce(deliveryError);
    const send = vi.spyOn(notifications, 'sendGoalReachedToCreator').mockRejectedValueOnce(deliveryError);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(caller(member).obligation.confirmCycle({
        collectionId: need.id, cycleNumber: 2, pledge: { obligationId: pledge.id, amount: 10 },
      })).resolves.toEqual({ ok: true });
      await expect.poll(() => log.mock.calls.filter(([, error]) => error === deliveryError).length).toBe(3);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } }))
        .toMatchObject({ status: 'BLOCKED', blockedAt: expect.any(Date) });
      expect(await db.obligation.findUniqueOrThrow({ where: { id: pledge.id } })).toMatchObject({ amount: 10 });
      expect(await db.notification.findUniqueOrThrow({ where: { id: notice.id } })).toMatchObject({ status: 'EXPIRED' });
      expect(await db.notification.count({
        where: { collectionId: need.id, userId: member, type: 'CYCLE_RENEWED', wave: 2, status: 'RESPONDED' },
      })).toBe(1);
    } finally {
      batch.mockRestore();
      recipients.mockRestore();
      send.mockRestore();
      log.mockRestore();
    }
  });

  const needClosed = { code: 'BAD_REQUEST', message: 'Collection is not open', cause: { needClosed: true } };

  it('finishes guarded inactivity deletion when an in-flight pledge needs the locked user', async () => {
    const [author, peer] = ['delete-inactive-author', 'delete-inactive-peer'];
    await db.user.createMany({ data: [author, peer].map((id) => ({ id, name: id })) });
    await db.connection.create({ data: { userAId: author, userBId: peer } });
    const data = { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } as const;
    const need = await db.collection.create({ data });
    // The request's heartbeat has already run and is throttled when the pledge reaches the router.
    await touchUserNow(db, author);
    const now = new Date();
    await db.user.update({
      where: { id: author },
      data: {
        lastSeen: new Date(now.getTime() - 731 * 24 * hour),
        inactivityStage: 2,
        inactivityWarnedAt: new Date(now.getTime() - 8 * 24 * hour),
      },
    });

    const gate = pauseAfterLockedRead(db, need.id);
    const pledging = caller(author).obligation.create({ collectionId: need.id, amount: 7 });
    void pledging.catch(() => {});
    let cleanup: ReturnType<typeof runInactiveCleanup> | undefined;
    try {
      const pid = await Promise.race([gate.read, pledging.then(() => { throw new Error('Pledge finished before locking the Need'); })]);
      cleanup = runInactiveCleanup(db, { now, onlyUserIds: [author] });
      await expect.poll(() => isBlockingTransaction(db, pid), { interval: 10 }).toBe(true);
      gate.resume();
      const [pledge, result] = await Promise.allSettled([pledging, cleanup]);
      expect(result).toMatchObject({ status: 'fulfilled', value: { deleted: 1, deletedSoft: 1 } });
      if (pledge.status === 'fulfilled') {
        expect(pledge.value).toMatchObject({ id: expect.any(String), collectionId: need.id, userId: author, amount: 7 });
      } else {
        expect(pledge.reason).toMatchObject(needClosed);
      }
      expect(await db.user.findUniqueOrThrow({ where: { id: author } })).toMatchObject({ deletedAt: expect.any(Date) });
      expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject({ status: 'CANCELLED' });
      expect(await db.obligation.findMany({ where: { collectionId: need.id } })).toEqual([]);
    } finally {
      gate.resume();
      await Promise.allSettled([pledging, cleanup]);
      gate.restore();
    }
  });

  it('finishes user-initiated deletion when setPaid holds the Need and needs the obligation', async () => {
    const [author, peer] = ['delete-mark-author', 'delete-mark-peer'];
    await db.user.createMany({ data: [author, peer].map((id) => ({ id, name: id })) });
    await db.connection.create({ data: { userAId: author, userBId: peer } });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: author, amount: 7 } });
    const gate = pauseAfterLockedRead(db, need.id);
    const mark = { collectionId: need.id, cycleNumber: need.cycleNumber, obligationIds: [row.id], paid: true };
    const marking = caller(author).obligation.setPaid(mark);
    void marking.catch(() => {});
    let deletion: Promise<{ success: boolean }> | undefined;
    try {
      const pid = await Promise.race([gate.read, marking.then(() => { throw new Error('Mark finished before reading the Need'); })]);
      deletion = caller(author).user.delete();
      void deletion.catch(() => {});
      await expect.poll(() => isBlockingTransaction(db, pid), { interval: 10 }).toBe(true);
      gate.resume();
      const [marked, deleted] = await Promise.allSettled([marking, deletion]);
      expect(deleted).toEqual({ status: 'fulfilled', value: { success: true } });
      if (marked.status === 'fulfilled') {
        expect(marked.value).toEqual({ changed: 1 });
      } else {
        expect(marked.reason).toMatchObject(needClosed);
      }
      expect(await db.user.findUniqueOrThrow({ where: { id: author } })).toMatchObject({ deletedAt: expect.any(Date) });
      expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject({ status: 'CANCELLED' });
      expect(await db.obligation.findUnique({ where: { id: row.id } })).toBeNull();
    } finally {
      gate.resume();
      await Promise.allSettled([marking, deletion]);
      gate.restore();
    }
  });

  it('cancels a Need created while account deletion waits on an older Need and obligation', async () => {
    const [author, peer] = ['delete-new-need-author', 'delete-new-need-peer'];
    await db.user.createMany({ data: [author, peer].map((id) => ({ id, name: id })) });
    await db.connection.create({ data: { userAId: author, userBId: peer } });
    const data = { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } as const;
    const need = await db.collection.create({ data });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: author, amount: 7 } });

    let deletion: Promise<{ success: boolean }> | undefined;
    try {
      const lateNeed = await db.$transaction(async (tx) => {
        const [backend] = await tx.$queryRaw<{ pid: number }[]>`SELECT pg_backend_pid() AS pid`;
        await tx.$queryRaw`SELECT "id" FROM collections WHERE "id" = ${need.id} FOR UPDATE`;
        await tx.obligation.update({ where: { id: row.id }, data: { confirmedAt: new Date() } });
        deletion = caller(author).user.delete();
        void deletion.catch(() => {});
        await expect.poll(() => isBlockingTransaction(db, backend!.pid), { interval: 10 }).toBe(true);
        return tx.collection.create({ data });
      });
      await expect(deletion).resolves.toEqual({ success: true });
      expect(await db.collection.findMany({
        where: { creatorId: author }, select: { id: true, status: true },
      })).toEqual(expect.arrayContaining([
        { id: need.id, status: 'CANCELLED' }, { id: lateNeed.id, status: 'CANCELLED' },
      ]));
    } finally {
      await Promise.allSettled([deletion]);
    }
  });

  it.each(['create', 'updateAmount', 'confirmCycle'] as const)('rejects a late %s after the Need closes', async (action) => {
    const author = 'closed-pledge-author-' + action;
    const member = 'closed-pledge-member-' + action;
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', cycleNumber: 2, currentCycleStart: new Date(), chatLink: 'https://example.com/chat' },
    });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 7 } });
    const viewer = caller(member);
    let closureStarted = false;
    const close = () => {
      closureStarted = true;
      return caller(author).collection.close({ id: need.id });
    };
    let restore: () => void;
    if (action === 'updateAmount') {
      const find = db.obligation.findUnique.bind(db.obligation);
      restore = vi.spyOn(db.obligation, 'findUnique').mockImplementationOnce((args) =>
        find(args).then(async (value) => { await close(); return value; }) as ReturnType<typeof find>,
      ).mockRestore;
    } else {
      const find = db.collection.findUnique.bind(db.collection);
      restore = vi.spyOn(db.collection, 'findUnique').mockImplementationOnce((args) =>
        find(args).then(async (value) => { await close(); return value; }) as ReturnType<typeof find>,
      ).mockRestore;
    }
    // This keeps the competing closure outside a transaction even if the mutation now locks first.
    const tx = db.$transaction.bind(db);
    const startTransaction = vi.spyOn(db, '$transaction').mockImplementationOnce(((operation: Parameters<typeof tx>[0]) => {
      if (closureStarted) return tx(operation);
      restore();
      return close().then(() => tx(operation));
    }) as typeof db.$transaction);
    try {
      const actions = {
        create: () => viewer.obligation.create({ collectionId: need.id, amount: 12 }),
        updateAmount: () => viewer.obligation.updateAmount({ obligationId: row.id, amount: 12 }),
        confirmCycle: () => viewer.obligation.confirmCycle({ collectionId: need.id, cycleNumber: need.cycleNumber }),
      };
      await expect(actions[action]()).rejects.toMatchObject({ code: 'BAD_REQUEST' });
      expect(await db.obligation.findMany({ where: { collectionId: need.id }, select: { id: true, amount: true } }))
        .toEqual([{ id: row.id, amount: 7 }]);
      expect(await db.notification.count({ where: { collectionId: need.id, type: 'CYCLE_RENEWED' } })).toBe(0);
    } finally {
      startTransaction.mockRestore();
      restore();
    }
  });

  it.each(['block', 'unblock', 'updateAmount', 'updateDescription', 'close', 'cancel'] as const)(
    'refuses a stale Need %s after another closure commits',
    async (action) => {
      const author = 'stale-need-author-' + action;
      await db.user.create({ data: { id: author, name: author } });
      await db.user.upsert({ where: { id: 'sweep-admin' }, create: { id: 'sweep-admin', name: 'admin' }, update: {} });
      const need = await db.collection.create({
        data: {
          creatorId: author, type: 'EMERGENCY', chatLink: 'https://example.com/chat', amount: 10,
          status: action === 'unblock' ? 'BLOCKED' : 'ACTIVE', blockReason: action === 'unblock' ? 'AUTHOR_REQUEST' : null,
        },
      });
      const closedAt = new Date(Date.now() - hour);
      const find = db.collection.findUnique.bind(db.collection);
      const snapshot = vi.spyOn(db.collection, 'findUnique').mockImplementationOnce((args) =>
        find(args).then(async (value) => {
          await db.collection.update({ where: { id: need.id }, data: { status: 'CLOSED', closedAt } });
          return value;
        }) as ReturnType<typeof find>,
      );
      try {
        const owner = caller(author).collection;
        const admin = caller('sweep-admin').collection;
        const actions = {
          block: () => admin.block({ id: need.id, reason: 'AUTHOR_REQUEST' }),
          unblock: () => admin.unblock({ id: need.id }),
          updateAmount: () => owner.updateAmount({ id: need.id, amount: 20 }),
          updateDescription: () => owner.updateDescription({ id: need.id, description: 'Changed' }),
          close: () => owner.close({ id: need.id }),
          cancel: () => owner.cancel({ id: need.id }),
        };
        await expect(actions[action]()).rejects.toMatchObject({ code: 'CONFLICT' });
        expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject({
          status: 'CLOSED', closedAt, amount: 10, description: null, blockReason: need.blockReason,
        });
      } finally {
        snapshot.mockRestore();
      }
    },
  );

  it('reports that a connection changed when a joiner is already gone', async () => {
    const [author, member] = ['remove-race-author', 'remove-race-member'];
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'EMERGENCY', chatLink: 'https://example.com/chat' } });
    const connection = await db.connection.create({ data: { userAId: author, userBId: member, viaCollectionId: need.id } });
    const find = db.connection.findUnique.bind(db.connection);
    const snapshot = vi.spyOn(db.connection, 'findUnique').mockImplementationOnce((args) =>
      find(args).then(async (value) => {
        await db.connection.delete({ where: { id: connection.id } });
        return value;
      }) as ReturnType<typeof find>,
    );
    try {
      await expect(caller(author).collection.removeJoiner({ collectionId: need.id, userId: member }))
        .rejects.toMatchObject({ code: 'CONFLICT' });
    } finally {
      snapshot.mockRestore();
    }
  });

  it('creates one closure notice per person even if they received multiple waves', async () => {
    const [author, member, other] = ['close-notices-author', 'close-notices-member', 'close-notices-other'];
    await db.user.createMany({ data: [author, member, other].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'EMERGENCY', chatLink: 'https://example.com/chat' } });
    const expiresAt = new Date(Date.now() + hour);
    await db.notification.createMany({ data: [
      { collectionId: need.id, userId: member, type: 'NEW_COLLECTION', wave: 1, expiresAt },
      { collectionId: need.id, userId: member, type: 'RE_NOTIFY', wave: 1, expiresAt },
      { collectionId: need.id, userId: other, type: 'NEW_COLLECTION', wave: 1, expiresAt },
    ] });
    await caller(author).collection.close({ id: need.id });
    expect(await db.notification.findMany({
      where: { collectionId: need.id, status: 'UNREAD' },
      select: { userId: true, wave: true, type: true },
      orderBy: { userId: 'asc' },
    })).toEqual([
      { userId: member, wave: 0, type: 'COLLECTION_CLOSED' },
      { userId: other, wave: 0, type: 'COLLECTION_CLOSED' },
    ]);
  });

  it('preserves the received summary when either mark procedure runs after closure', async () => {
    const [author, participant] = ['close-marks-author', 'close-marks-member'];
    await db.user.createMany({ data: [author, participant].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: participant, amount: 4 } });
    const unmarked = await db.obligation.create({ data: { collectionId: need.id, userId: participant, amount: 6 } });
    const owner = caller(author);
    const displayed = { collectionId: need.id, cycleNumber: need.cycleNumber };
    const marked = await owner.obligation.confirmPayment({ ...displayed, obligationId: row.id });
    expect(marked.confirmedAt).toBeInstanceOf(Date);
    await owner.collection.close({ id: need.id });
    const summary = async () => {
      const view = await owner.collection.getById({ id: need.id });
      return view.obligations.filter((row) => row.confirmedAt != null).map(({ id, confirmedAt, amount }) => ({ id, confirmedAt, amount }));
    };
    const before = await summary();
    expect(before).toEqual([{ id: marked.id, confirmedAt: marked.confirmedAt, amount: 4 }]);
    const results = await Promise.allSettled([
      owner.obligation.confirmPayment({ ...displayed, obligationId: marked.id }),
      owner.obligation.setPaid({ ...displayed, obligationIds: [unmarked.id], paid: true }),
    ]);
    expect(await summary()).toEqual(before);
    const rejected = { status: 'rejected', reason: expect.objectContaining({ code: 'BAD_REQUEST' }) };
    expect(results).toEqual([rejected, rejected]);
  });

  it.each(['close', 'hold', 'reschedule', 'advance'] as const)('skips rollover when a %s commits after the due-cycle lookup', async (change) => {
    const author = 'rollover-race-author-' + change;
    const member = 'rollover-race-member-' + change;
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const due = new Date(Date.now() - (REGULAR_CYCLE_DAYS + 1) * 24 * hour);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat', currentCycleStart: due },
    });
    const confirmedAt = new Date();
    const mark = await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 7, confirmedAt } });
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    const findCycles = db.collection.findMany.bind(db.collection);
    const rescheduled = new Date();
    const expected = {
      close: { status: 'CLOSED', cycleNumber: 1, currentCycleStart: due, blockReason: null },
      hold: { status: 'BLOCKED', cycleNumber: 1, currentCycleStart: due, blockReason: 'AUTHOR_REQUEST' },
      reschedule: { status: 'ACTIVE', cycleNumber: 1, currentCycleStart: rescheduled, blockReason: null },
      advance: { status: 'ACTIVE', cycleNumber: 2, currentCycleStart: due, blockReason: null },
    } as const;
    const lookup = vi.spyOn(db.collection, 'findMany').mockImplementationOnce((args) =>
      findCycles(args).then(async (rows) => {
        if (change === 'close') await caller(author).collection.close({ id: need.id });
        else await db.collection.update({ where: { id: need.id }, data: expected[change] });
        return rows;
      }) as ReturnType<typeof findCycles>,
    );
    try {
      await processCycleClose({} as Job);
      expect(await db.collection.findUniqueOrThrow({ where: { id: need.id } })).toMatchObject(expected[change]);
      expect(await db.obligation.findUniqueOrThrow({ where: { id: mark.id } })).toMatchObject({ confirmedAt });
      expect(await db.obligationReceipt.count({ where: { collectionId: need.id } })).toBe(0);
      expect(await db.notification.count({ where: { collectionId: need.id } })).toBe(0);
    } finally {
      lookup.mockRestore();
      getDb.mockRestore();
      // An overdue held fixture should not be eligible in subsequent worker runs.
      await db.collection.update({ where: { id: need.id }, data: { status: 'CLOSED' } });
    }
  });

  it.each([
    ['start', 'CYCLE_RENEWED', processCycleClose, REGULAR_CYCLE_DAYS + 1, 2],
    ['reminder', 'CYCLE_RENEWAL_REMINDER', processCycleRenewalReminder, REGULAR_CYCLE_DAYS - 2.5, 1],
  ] as const)('inserts %s notices for current eligible participants and dispatches only fresh inserts', async (event, type, run, daysOld, wave) => {
    const id = (role: string) => 'current-' + event + '-' + role;
    const author = id('author');
    const active = id('active');
    const withdrawn = id('withdrawn');
    const muted = id('muted');
    const duplicate = id('duplicate');
    const deleted = id('deleted');
    await db.user.createMany({
      data: [author, active, withdrawn, muted, duplicate, deleted].map((id) => ({
        id, name: id, deletedAt: id === deleted ? new Date() : null,
      })),
    });
    await db.platformAccount.create({ data: { userId: active, platform: 'TELEGRAM', platformId: active } });
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat', currentCycleStart: new Date(Date.now() - daysOld * 24 * hour) },
    });
    await db.obligation.createMany({
      data: [author, active, active, withdrawn, muted, duplicate, deleted].map((userId) => ({
        collectionId: need.id, userId, amount: 7,
      })),
    });
    await db.notification.create({
      data: { collectionId: need.id, userId: duplicate, type, wave, expiresAt: new Date(Date.now() + hour) },
    });
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    const findCycles = db.collection.findMany.bind(db.collection);
    const changeEligibility = async () => {
      await caller(withdrawn).obligation.unsubscribeFromCollection({ collectionId: need.id });
      await db.user.update({
        where: { id: muted }, data: event === 'start' ? { notifyRenewalStart: false } : { notifyRenewalReminder: false },
      });
    };
    const lookup = vi.spyOn(db.collection, 'findMany').mockImplementationOnce((args) =>
      findCycles(args).then(async (rows) => {
        await changeEligibility();
        return rows;
      }) as ReturnType<typeof findCycles>,
    );
    try {
      await run({} as Job);
      if (event === 'reminder') await run({} as Job);
      const notices = await db.notification.findMany({
        where: { collectionId: need.id, type }, select: { userId: true, wave: true }, orderBy: { userId: 'asc' },
      });
      expect(notices).toEqual([{ userId: active, wave }, { userId: duplicate, wave }]);
      const deliveries = () => db.notificationDelivery.findMany({
        where: { eventKey: 'cycle:' + need.id + ':' + wave + ':' + event }, select: { userId: true },
        orderBy: { userId: 'asc' },
      });
      await expect.poll(deliveries).toEqual([{ userId: active }]);
    } finally {
      lookup.mockRestore();
      getDb.mockRestore();
    }
  });

  it('excludes a person withdrawn after the cycle snapshot from rollover notices', async () => {
    const [author, active, withdrawn] = ['rollover-author', 'rollover-active', 'rollover-withdrawn'];
    await db.user.createMany({ data: [author, active, withdrawn].map((id) => ({ id, name: id })) });
    await db.platformAccount.create({ data: { userId: active, platform: 'TELEGRAM', platformId: active } });
    const need = await db.collection.create({
      data: {
        creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat',
        currentCycleStart: new Date(Date.now() - (REGULAR_CYCLE_DAYS + 1) * 24 * hour),
      },
    });
    await db.obligation.createMany({ data: [
      { collectionId: need.id, userId: active, amount: 4 },
      { collectionId: need.id, userId: active, amount: 6 },
      { collectionId: need.id, userId: withdrawn, amount: 7 },
    ] });
    const getDb = vi.spyOn(database, 'getDb').mockReturnValue(db);
    const findCycles = db.collection.findMany.bind(db.collection);
    const cycleSnapshot = vi.spyOn(db.collection, 'findMany').mockImplementationOnce((args) => {
      const snapshot = findCycles(args).then(async (rows) => {
        await caller(withdrawn).obligation.unsubscribeFromCollection({ collectionId: need.id });
        return rows;
      });
      // The worker awaits the query directly, so the delayed real result is sufficient.
      return snapshot as ReturnType<typeof findCycles>;
    });
    try {
      await processCycleClose({} as Job);
    } finally {
      cycleSnapshot.mockRestore();
      getDb.mockRestore();
    }
    const notices = await db.notification.findMany({
      where: { collectionId: need.id, type: { in: ['COLLECTION_CLOSED', 'CYCLE_RENEWED'] } },
      select: { userId: true, type: true, wave: true },
      orderBy: [{ wave: 'asc' }, { userId: 'asc' }],
    });
    expect(notices).toEqual([
      { userId: active, type: 'COLLECTION_CLOSED', wave: 1 },
      { userId: active, type: 'CYCLE_RENEWED', wave: 2 },
    ]);
    await expect.poll(() => db.notificationDelivery.count({ where: { eventKey: `cycle:${need.id}:2:start` } })).toBe(1);
  });

  it.each([
    ['closed', sendCycleRenewalReminderTg, { status: 'CLOSED', cycleNumber: 2 }],
    ['advanced', sendCycleRenewedTg, { status: 'ACTIVE', cycleNumber: 3 }],
  ] as const)('skips cycle delivery when the Need has %s since its notice was inserted', async (change, send, state) => {
    const author = 'late-delivery-author-' + change;
    const member = 'late-delivery-member-' + change;
    await db.user.createMany({ data: [author, member].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', currentCycleStart: new Date(), chatLink: 'https://example.com/chat', ...state },
    });
    await db.obligation.create({ data: { collectionId: need.id, userId: member, amount: 4 } });
    await enqueueNeedNotice(db, change === 'closed' ? 'reminder' : 'start', need.id, 2, [member]);
    await send(db, need.id, author, [member], 2);
    expect(await db.notificationDelivery.count({ where: { userId: member } })).toBe(0);
    expect(await db.notificationDelivery.count({ where: { eventKey: { startsWith: 'cycle:' + need.id + ':' } } })).toBe(0);
  });

  it.each([
    ['reminder', sendCycleRenewalReminderTg, REGULAR_CYCLE_DAYS],
    ['start', sendCycleRenewedTg, 0],
  ] as const)('sends the %s message only to active participants', async (event, sendCycleNotice, offsetDays) => {
    const author = `renewal-${event}-author`;
    const active = `renewal-${event}-active`;
    const withdrawn = `renewal-${event}-withdrawn`;
    await db.user.createMany({ data: [author, active, withdrawn].map((id) => ({ id, name: id, language: 'ru' })) });
    const currentCycleStart = new Date(Date.now() - 4 * 24 * hour);
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', cycleNumber: 2, currentCycleStart, chatLink: 'https://example.com/private-chat' },
    });
    await db.obligation.createMany({ data: [
      { collectionId: need.id, userId: active, amount: 120 },
      { collectionId: need.id, userId: active, amount: 180 },
      { collectionId: need.id, userId: withdrawn, amount: 6, unsubscribedAt: new Date() },
    ] });
    await db.platformAccount.createMany({
      data: [active, withdrawn].map((userId) => ({ platform: 'TELEGRAM', platformId: userId, userId })),
    });
    await enqueueNeedNotice(db, event, need.id, 2, [active, withdrawn]);
    await sendCycleNotice(db, need.id, author, [active, withdrawn], 2);
    const deliveries = await db.notificationDelivery.findMany({ where: { eventKey: `cycle:${need.id}:2:${event}` } });
    expect(deliveries.map((delivery) => delivery.userId)).toEqual([active]);
    const messages = sendsTo(active).map(([, init]) => {
      const { text, reply_markup } = JSON.parse(String(init?.body));
      return { text, replyMarkup: reply_markup };
    });
    expect(sendsTo(withdrawn)).toHaveLength(0);
    expect(messages).toHaveLength(1);
    expect(messages?.[0]?.replyMarkup?.inline_keyboard.flat()).toEqual([
      expect.objectContaining({ web_app: { url: `${WEB_APP_URL}/collection/${need.id}` } }),
    ]);
    const day = 24 * hour;
    const period = new Intl.DateTimeFormat('ru', { dateStyle: 'medium', timeZone: 'UTC' }).formatRange(
      new Date(currentCycleStart.getTime() + offsetDays * day),
      new Date(currentCycleStart.getTime() + (offsetDays + REGULAR_CYCLE_DAYS - 1) * day),
    );
    expect(messages?.[0]?.text).toContain('Период: ' + period);
    expect(messages?.[0]?.text).toContain('300\u00a0$');
    expect(messages?.[0]?.text).not.toContain('—');
    expect(JSON.stringify(messages)).not.toContain('https://example.com/private-chat');
  });

  it('tracks claims for the inviter’s requested QR tokens even after the connection is removed', async () => {
    const [inviter, scanner, other] = ['qr-inviter', 'qr-scanner', 'qr-other'];
    await db.user.createMany({ data: [inviter, scanner, other].map((id) => ({ id, name: id })) });
    const owner = caller(inviter);
    const visitor = caller(other);
    const { id, token } = await owner.invite.generate({ ttl: 60 });
    const unused = await owner.invite.generate({ ttl: 60 });
    const unrelated = await visitor.invite.generate({ ttl: 60 });
    await caller(scanner).invite.accept({ token });
    const removed = await db.connection.deleteMany({ where: { userAId: inviter, userBId: scanner } });
    expect(removed.count).toBe(1);
    expect(await owner.invite.liveClaims({ inviteIds: [unused.id, unrelated.id] })).toEqual([]);
    expect(await visitor.invite.liveClaims({ inviteIds: [id] })).toEqual([]);
    expect(await owner.invite.liveClaims({ inviteIds: [id, unused.id] })).toEqual([
      { id, claimed: true, person: { id: scanner, name: scanner, photoUrl: null } },
    ]);
  });

  it('describes the time limit for a browser invite only when it came from an in-person QR', async () => {
    const inviter = 'qr-copy-inviter';
    const visitor = 'qr-copy-visitor';
    await db.user.createMany({ data: [inviter, visitor].map((id) => ({ id, name: id })) });
    const qr = await caller(inviter).invite.generate({ ttl: 60 });
    const personal = await caller(inviter).invite.generate();
    const view = caller(visitor).invite;
    expect(await view.getByToken({ token: qr.token })).toMatchObject({ inPersonUntil: qr.expiresAt, expired: false });
    expect(await view.getByToken({ token: personal.token })).toMatchObject({ inPersonUntil: null });
    expect(await view.getByToken({ token: inviter })).toMatchObject({ inPersonUntil: null });

    const expiredAt = new Date(Date.now() - hour);
    await db.inviteLink.update({ where: { id: qr.id }, data: { expiresAt: expiredAt } });
    expect(await view.getByToken({ token: qr.token })).toMatchObject({ inPersonUntil: expiredAt, expired: true });
    expect(await view.accept({ token: qr.token, viaLink: true })).toMatchObject({ pending: true });
  });

  it('opens and declines an undecided Need behind 100 newer notices', async () => {
    const author = 'attention-author';
    const viewer = 'attention-viewer';
    await db.user.createMany({ data: [author, viewer].map((id) => ({ id, name: id })) });
    const [need, activity] = await Promise.all([100, 200].map((amount) => db.collection.create({
      data: { creatorId: author, type: 'EMERGENCY', amount, chatLink: 'https://example.test/chat' },
    })));
    const expiresAt = new Date(Date.now() + hour);
    const lastExpiry = new Date(Date.now() + 2 * hour);
    const notice = { userId: viewer, collectionId: need!.id };
    await db.notification.createMany({ data: [
      { ...notice, type: 'NEW_COLLECTION', status: 'UNREAD', createdAt: new Date(1000), expiresAt: lastExpiry },
      { ...notice, type: 'RE_NOTIFY', status: 'UNREAD', createdAt: new Date(2000), expiresAt },
      { ...notice, type: 'SPECIAL_AUTHOR', status: 'UNREAD', createdAt: new Date(3000), expiresAt },
      { ...notice, type: 'SPECIAL_DEVELOPER', status: 'DISMISSED', expiresAt },
      { ...notice, type: 'RE_NOTIFY', wave: 2, status: 'RESPONDED', expiresAt },
      { ...notice, userId: author, type: 'NEW_COLLECTION', status: 'UNREAD', expiresAt },
      ...Array.from({ length: 101 }, (_, i) => ({
        userId: viewer, collectionId: activity!.id, type: 'COLLECTION_CLOSED' as const,
        wave: i + 1, createdAt: new Date(4000 + i), expiresAt,
      })),
    ] });
    await db.pendingConnection.create({ data: { fromUserId: author, toUserId: viewer } });

    const { collection, notification } = caller(viewer);
    const feed = await notification.list({ limit: 100, includeWaiting: true });
    expect(feed.items).toHaveLength(100);
    expect(feed.items.every((n) => n.collectionId === activity!.id)).toBe(true);
    expect(feed.nextCursor).toBeDefined();
    const nextPage = await notification.list({ limit: 100, cursor: feed.nextCursor, includeWaiting: true });
    expect(nextPage.items[0]?.collectionId).toBe(activity!.id);
    expect(nextPage.waiting).toEqual([]);
    expect(feed.waiting).toEqual([expect.objectContaining({ collectionId: need!.id, expiresAt: lastExpiry })]);
    expect(await notification.attention()).toEqual({ needs: 1, incoming: 1 });

    const detail = () => collection.getById({ id: need!.id });
    expect(await detail()).toMatchObject({ waitingForMe: true, waitingExpiresAt: lastExpiry });
    expect(await detail()).toMatchObject({ waitingForMe: true });
    expect(await caller(author).collection.getById({ id: need!.id }))
      .toMatchObject({ waitingForMe: false, waitingExpiresAt: null });
    const dismissed = await db.notification.findFirstOrThrow({ where: { ...notice, status: 'DISMISSED' } });
    expect(await notification.markRead({ id: dismissed.id })).toMatchObject({ status: 'DISMISSED' });
    const statuses = await db.notification.findMany({ where: { collectionId: need!.id }, select: { status: true, userId: true } });
    expect(statuses.filter((n) => n.userId === viewer).map((n) => n.status).sort())
      .toEqual(['DISMISSED', 'READ', 'READ', 'READ', 'RESPONDED']);
    expect(statuses.find((n) => n.userId === author)?.status).toBe('UNREAD');
    expect(await db.notifyStats.findUnique({ where: { userId: viewer } })).toMatchObject({ opened: 1 });
    expect(await notification.attention()).toEqual({ needs: 1, incoming: 1 });

    expect(await notification.dismissNeed({ collectionId: need!.id })).toEqual({ count: 3 });
    await db.notification.create({ data: {
      ...notice, type: 'RE_NOTIFY', wave: 3, status: 'READ', expiresAt: new Date(Date.now() - hour),
    } });
    expect(await detail()).toMatchObject({ waitingForMe: false, waitingExpiresAt: null });
    expect((await notification.list({ limit: 100, includeWaiting: true })).waiting).toEqual([]);
    expect(await notification.attention()).toEqual({ needs: 0, incoming: 1 });
  });

  it('counts one current-cycle confirmation until the participant confirms or withdraws', async () => {
    const author = 'renewal-attention-author';
    const viewer = 'renewal-attention-viewer';
    const newJoiner = 'renewal-attention-new';
    await db.user.createMany({ data: [author, viewer, newJoiner].map((id) => ({ id, name: id })) });
    const currentCycleStart = new Date(Date.now() - hour);
    const [confirm, withdraw] = await Promise.all([100, 200].map((amount) => db.collection.create({
      data: {
        creatorId: author, type: 'REGULAR', amount, chatLink: 'https://example.test/chat',
        cycleNumber: 3, currentCycleStart,
      },
    })));
    await db.obligation.createMany({ data: [
      ...[confirm!, withdraw!].map(({ id }) => ({
        userId: viewer, collectionId: id, amount: 2, isSubscription: true, createdAt: new Date(1000),
      })),
      { userId: newJoiner, collectionId: confirm!.id, amount: 2, createdAt: currentCycleStart },
    ] });
    const expiresAt = new Date(Date.now() + hour);
    await db.notification.createMany({ data: [
      { userId: viewer, collectionId: confirm!.id, type: 'CYCLE_RENEWED', wave: 2, status: 'RESPONDED', expiresAt },
      { userId: viewer, collectionId: confirm!.id, type: 'CYCLE_RENEWED', wave: 3, status: 'READ', expiresAt },
      { userId: viewer, collectionId: confirm!.id, type: 'RE_NOTIFY', expiresAt },
      { userId: viewer, collectionId: withdraw!.id, type: 'NEW_COLLECTION', status: 'READ', expiresAt },
    ] });

    const { notification, obligation, collection } = caller(viewer);
    const feed = await notification.list({ limit: 1, includeWaiting: true });
    expect(feed.waiting).toEqual([]);
    expect(feed.waitingRenewals.map((row) => row.collection.id).sort()).toEqual([confirm!.id, withdraw!.id].sort());
    expect(await notification.attention()).toEqual({ needs: 2, incoming: 0 });
    expect(await collection.getById({ id: confirm!.id }))
      .toMatchObject({ waitingForMe: true, needsCycleConfirmation: true, waitingExpiresAt: null });
    expect(await caller(newJoiner).notification.attention()).toEqual({ needs: 0, incoming: 0 });

    await obligation.confirmCycle({ collectionId: confirm!.id, cycleNumber: 3 });
    expect(await collection.getById({ id: confirm!.id }))
      .toMatchObject({ waitingForMe: false, needsCycleConfirmation: false });
    expect(await notification.attention()).toEqual({ needs: 1, incoming: 0 });
    await obligation.unsubscribeFromCollection({ collectionId: withdraw!.id });
    expect(await collection.getById({ id: withdraw!.id }))
      .toMatchObject({ waitingForMe: false, needsCycleConfirmation: false });
    expect((await notification.list({ limit: 1, includeWaiting: true })).waitingRenewals).toEqual([]);
    expect(await notification.attention()).toEqual({ needs: 0, incoming: 0 });
  });

  it('clears a live request wave when the last Participation is withdrawn by ID', async () => {
    const author = 'withdraw-by-id-author';
    const viewer = 'withdraw-by-id-viewer';
    await db.user.createMany({ data: [author, viewer].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({
      data: {
        creatorId: author, type: 'REGULAR', amount: 100, chatLink: 'https://example.test/chat',
        cycleNumber: 2, currentCycleStart: new Date(Date.now() - hour),
      },
    });
    const [first, last] = await db.obligation.createManyAndReturn({
      data: [2, 3].map((amount) => ({
        userId: viewer, collectionId: need.id, amount, isSubscription: true, createdAt: new Date(1000),
      })),
    });
    const request = await db.notification.create({
      data: {
        userId: viewer, collectionId: need.id, type: 'RE_NOTIFY', status: 'READ',
        expiresAt: new Date(Date.now() + hour),
      },
    });

    const { collection, notification, obligation } = caller(viewer);
    const detail = () => collection.getById({ id: need.id });
    expect(await detail()).toMatchObject({ waitingForMe: true, needsCycleConfirmation: true });
    expect(await notification.attention()).toEqual({ needs: 1, incoming: 0 });

    await obligation.unsubscribe({ obligationId: first!.id });
    expect(await db.notification.findUniqueOrThrow({ where: { id: request.id } }))
      .toMatchObject({ status: 'READ' });
    expect(await detail()).toMatchObject({ waitingForMe: true, needsCycleConfirmation: true });

    await obligation.unsubscribe({ obligationId: last!.id });
    expect(await detail()).toMatchObject({ waitingForMe: false, needsCycleConfirmation: false, waitingExpiresAt: null });
    expect(await notification.attention()).toEqual({ needs: 0, incoming: 0 });
  });

  it('limits amounts and chat to the author and active participants, and received marks to the author', async () => {
    const author = 'privacy-author';
    const { circle } = await seedNetwork(author, 5, 6);
    const participant = circle[0]!;
    const remaining = circle[1]!;
    const viewer = circle[2]!;
    const admin = 'privacy-admin';
    await db.user.create({ data: { id: admin, name: admin } });
    const chatLink = 'https://example.com/participants';
    const need = await db.collection.create({
      data: { creatorId: author, type: 'REGULAR', amount: 100, chatLink },
    });
    const marked = await db.obligation.create({
      data: {
        collectionId: need.id, userId: participant, amount: 4, originalAmount: 8,
        originalCurrency: 'EUR', confirmedAt: new Date(), isSubscription: true,
      },
    });
    await db.obligation.create({
      data: { collectionId: need.id, userId: remaining, amount: 6, originalAmount: 9, originalCurrency: 'EUR' },
    });
    await db.notification.createMany({
      data: [author, participant, viewer].map((userId) => ({
        userId, collectionId: need.id, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + hour),
      })),
    });

    const detail = (userId: string) => caller(userId).collection.getById({ id: need.id });
    const notice = async (userId: string) => (await caller(userId).notification.list({}))
      .items.find((item) => item.collectionId === need.id)?.collection;

    const ownerView = await detail(author);
    expect(ownerView.chatLink).toBe(chatLink);
    expect(ownerView.obligations).toContainEqual(expect.objectContaining({
      id: marked.id, amount: 4, confirmedAt: marked.confirmedAt,
    }));
    expect(await notice(author)).toMatchObject({ chatLink });

    const activeView = await detail(participant);
    expect(activeView).toMatchObject({ chatLink, currentAmount: 10, amount: 100 });
    expect(activeView.obligations).toHaveLength(2);
    expect(activeView.obligations).toContainEqual(expect.objectContaining({ userId: remaining, amount: 6 }));
    expect(activeView.obligations.every((row) => row.confirmedAt === null)).toBe(true);
    expect(await notice(participant)).toMatchObject({ chatLink, obligations: [{ amount: 4 }] });
    expect(await caller(participant).obligation.myList()).toEqual([
      expect.objectContaining({ amount: 4, confirmedAt: null, collection: expect.objectContaining({ chatLink }) }),
    ]);

    const viewerView = await detail(viewer);
    expect(viewerView).toMatchObject({ chatLink: null, currentAmount: 10, amount: 100 });
    expect(viewerView.obligations).toHaveLength(2);
    expect(viewerView.obligations).toContainEqual(expect.objectContaining({ user: expect.objectContaining({ name: participant }) }));
    for (const row of viewerView.obligations) {
      expect(row).toMatchObject({ amount: null, originalAmount: null, originalCurrency: null, confirmedAt: null });
    }
    expect(await notice(viewer)).toMatchObject({ chatLink: null, obligations: [] });

    const publicView = await caller(viewer).collection.getPublic({ id: need.id });
    expect(publicView).toMatchObject({ currentAmount: 10, amount: 100, _count: { obligations: 2 } });
    expect(publicView).not.toHaveProperty('obligations');
    expect(publicView).not.toHaveProperty('chatLink');

    const withdrawn = await caller(participant).obligation.unsubscribe({ obligationId: marked.id });
    expect(withdrawn).toEqual({ ok: true });
    const firstWithdrawal = await db.obligation.findUniqueOrThrow({ where: { id: marked.id } });
    expect(await caller(participant).obligation.unsubscribe({ obligationId: marked.id })).toEqual({ ok: true });
    await expect(caller(participant).obligation.updateAmount({ obligationId: marked.id, amount: 12 }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(await db.obligation.findUniqueOrThrow({ where: { id: marked.id } })).toEqual(firstWithdrawal);
    expect(await caller(participant).stats.helpHistory({ userId: participant })).toEqual({ helped: [], helpedBy: [] });
    expect(await caller(admin).stats.helpHistory({ userId: author })).toEqual({ helped: [], helpedBy: [] });
    expect((await caller(author).stats.helpHistory({ userId: author })).helpedBy)
      .toEqual([expect.objectContaining({ userId: remaining, amount: 6 })]);
    const withdrawnView = await detail(participant);
    expect(withdrawnView).toMatchObject({ chatLink: null, currentAmount: 6 });
    expect(withdrawnView.obligations).toEqual([expect.objectContaining({ userId: remaining, amount: null })]);
    expect(await notice(participant)).toBeUndefined();
    await db.notification.create({
      data: {
        userId: participant, collectionId: need.id, type: 'CYCLE_RENEWAL_REMINDER',
        expiresAt: new Date(Date.now() + hour),
      },
    });
    expect(await notice(participant)).toMatchObject({ chatLink: null, obligations: [] });
    expect(await caller(participant).obligation.myList()).toEqual([
      expect.objectContaining({
        amount: null, originalAmount: null, originalCurrency: null, confirmedAt: null,
        collection: expect.objectContaining({ chatLink: null }),
      }),
    ]);
  });
});

describe('Need notification waves', () => {
  it('uses provider receipts for the daily and weekly limits and keeps the 14-day ignore pause', async () => {
    const author = 'routing-caps';
    const { circle: people } = await seedNetwork(author, 5, 1);
    const [pending, daily, weekly, ignoring, probe] = people as [string, string, string, string, string];
    const daysAgo = (days: number) => new Date(Date.now() - days * 24 * hour);
    await db.notificationDelivery.createMany({ data: [
      ...[1, 2].map((wave) => ({ userId: pending, eventKey: `need-notice:new:n${wave}:1`, channel: 'APP' as const })),
      ...[1, 2].map((wave) => ({
        userId: daily, eventKey: `col:d${wave}:new`, channel: 'TELEGRAM' as const, createdAt: daysAgo(1 - 1 / 48),
      })),
      ...Array.from({ length: 6 }, (_, wave) => ({
        userId: weekly, eventKey: `col:w${wave}:new`, channel: 'TELEGRAM' as const, createdAt: daysAgo(7 - 1 / 48),
      })),
    ] });
    await db.notifyStats.createMany({ data: [
      { userId: ignoring, ignoreStreak: 5, lastSentAt: daysAgo(13) },
      { userId: probe, ignoreStreak: 5, lastSentAt: daysAgo(15) },
    ] });
    const plan = await planWave(db, [people.map((userId) => ({ userId, path: [author, userId], depth: 1, maxConnAt: null }))], 5);
    expect(plan.external.map(({ userId }) => userId)).toEqual([pending, probe]);
    expect(plan.inApp.map(({ userId }) => userId)).toEqual([daily, weekly, ignoring]);
  });

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
