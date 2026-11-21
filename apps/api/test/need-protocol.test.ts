import * as database from '@so/db';
import type { PrismaClient } from '@so/db';
import type { Job } from 'bullmq';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { appRouter } from '../src/routers/index.js';
import { getAskAccess } from '../src/services/ask-access.service.js';
import { invalidateGraph } from '../src/services/graph-cache.service.js';
import { sendCycleRenewalReminderTg, sendCycleRenewedTg } from '../src/services/notification.service.js';
import * as telegram from '../src/services/telegram-bot.service.js';
import { WEB_APP_URL } from '../src/deployment.js';
import { processCycleClose } from '../src/workers/cycle-close.worker.js';
import { runReNotify } from '../src/workers/re-notify.worker.js';
import { createTestDatabase } from './test-database.js';

vi.hoisted(() => {
  // Enable only local behavior, even if a developer's shell exports integration settings.
  for (const key of [
    'ADMIN_IDS', 'TELEGRAM_BOT_TOKEN', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY', 'RESEND_API_KEY',
  ]) delete process.env[key];
  process.env.JWT_SECRET = 'local-need-protocol-test-key';
  process.env.ADMIN_IDS = 'privacy-admin';
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
    await owner.obligation.setPaid({ obligationIds: [row.id], paid: true });
    expect(await member.notification.pulse()).toEqual(before);
    expect(before.participating).not.toHaveProperty('confirmed');
    const marked = (await owner.notification.pulse()).mine;
    expect(marked).toMatchObject({ confirmed: 1 });
    expect(marked?.pledgeAt).toBeGreaterThan(row.createdAt.getTime());
    await owner.obligation.setPaid({ obligationIds: [row.id], paid: false });
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

  it('preserves the received summary when either mark procedure runs after closure', async () => {
    const [author, participant] = ['close-marks-author', 'close-marks-member'];
    await db.user.createMany({ data: [author, participant].map((id) => ({ id, name: id })) });
    const need = await db.collection.create({ data: { creatorId: author, type: 'REGULAR', chatLink: 'https://example.com/chat' } });
    const row = await db.obligation.create({ data: { collectionId: need.id, userId: participant, amount: 4 } });
    const unmarked = await db.obligation.create({ data: { collectionId: need.id, userId: participant, amount: 6 } });
    const owner = caller(author);
    const marked = await owner.obligation.confirmPayment({ obligationId: row.id });
    expect(marked.confirmedAt).toBeInstanceOf(Date);
    await owner.collection.close({ id: need.id });
    const summary = async () => {
      const view = await owner.collection.getById({ id: need.id });
      return view.obligations.filter((row) => row.confirmedAt != null).map(({ id, confirmedAt, amount }) => ({ id, confirmedAt, amount }));
    };
    const before = await summary();
    expect(before).toEqual([{ id: marked.id, confirmedAt: marked.confirmedAt, amount: 4 }]);
    const results = await Promise.allSettled([
      owner.obligation.confirmPayment({ obligationId: marked.id }),
      owner.obligation.setPaid({ obligationIds: [unmarked.id], paid: true }),
    ]);
    expect(await summary()).toEqual(before);
    const rejected = { status: 'rejected', reason: expect.objectContaining({ code: 'BAD_REQUEST' }) };
    expect(results).toEqual([rejected, rejected]);
  });

  it('excludes a person withdrawn after the cycle snapshot from rollover notices', async () => {
    const [author, active, withdrawn] = ['rollover-author', 'rollover-active', 'rollover-withdrawn'];
    await db.user.createMany({ data: [author, active, withdrawn].map((id) => ({ id, name: id })) });
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
    ['reminder', sendCycleRenewalReminderTg, REGULAR_CYCLE_DAYS],
    ['start', sendCycleRenewedTg, 0],
  ] as const)('sends the %s message only to active participants', async (event, sendCycleNotice, offsetDays) => {
    const author = `renewal-${event}-author`;
    const active = `renewal-${event}-active`;
    const withdrawn = `renewal-${event}-withdrawn`;
    await db.user.createMany({ data: [author, active, withdrawn].map((id) => ({ id, name: id, language: 'ru' })) });
    const currentCycleStart = new Date('2026-11-20T18:30:00Z');
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
    const send = vi.spyOn(telegram, 'sendTgMessages');
    try {
      await sendCycleNotice(db, need.id, author, [active, withdrawn]);
      const deliveries = await db.notificationDelivery.findMany({ where: { eventKey: `cycle:${need.id}:2:${event}` } });
      expect(deliveries.map((delivery) => delivery.userId)).toEqual([active]);
      expect(send).toHaveBeenCalledTimes(1);
      const messages = send.mock.calls[0]?.[0];
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
    } finally {
      send.mockRestore();
    }
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
