import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo, Socket } from 'node:net';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@so/db';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createTestDatabase } from './test-database.js';

vi.hoisted(() => {
  for (const key of [
    'ADMIN_IDS', 'TELEGRAM_BOT_TOKEN', 'REDIS_URL', 'FIREBASE_SERVICE_ACCOUNT',
    'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'APNS_KEY', 'RESEND_API_KEY',
  ]) delete process.env[key];
  process.env.JWT_SECRET = 'local-security-db-test-key';
  // One known admin, for the admin REST check (the account is created with this id below)
  process.env.ADMIN_IDS = 'sec-admin-boundary';
});

// No mail leaves the test: the code is read from the call instead
const sent = vi.hoisted(() => [] as Array<{ to: string; text: string }>);
vi.mock('../src/services/mail.service.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('../src/services/mail.service.js')>(),
  sendMail: vi.fn(async (msg: { to: string; text: string }) => { sent.push(msg); }),
}));

const { appRouter } = await import('../src/routers/index.js');
const { EMAIL_CODE_MAX_ATTEMPTS } = await import('../src/services/email-code.service.js');
const { verifyToken, tokenIssuedMs, createRefreshToken } = await import('../src/services/auth.service.js');
const { isActiveAccount } = await import('../src/services/active-account.js');
const { mergeEmptyAccountInto, linkTelegramByCode } = await import('../src/services/telegram-link.service.js');
const { findOrCreateAppleUser } = await import('../src/services/apple.service.js');
const { createContext } = await import('../src/context.js');
const { activeAdminFromAuthHeader } = await import('../src/services/admin-session.js');
const { startGunRelay } = await import('../src/gun-relay.js');
const { registerTrpcApi } = await import('../src/trpc-http.js');
const Fastify = (await import('fastify')).default;

let db: PrismaClient;
let dispose: (() => Promise<void>) | undefined;
let ipSeq = 0;

beforeAll(async () => {
  ({ db, dispose } = await createTestDatabase());
}, 60_000);
afterAll(async () => dispose?.(), 30_000);

/** Each case gets its own address, so the in-memory per-IP limits of one case never touch another. */
function caller(userId: string | null = null, ip = `198.51.100.${++ipSeq}`) {
  return appRouter.createCaller({ db, userId, ip });
}

/** A caller signed in with this access token, as the HTTP context builds it. */
function callerWithToken(accessToken: string) {
  const payload = verifyToken(accessToken)!;
  return appRouter.createCaller({ db, userId: payload.sub, tokenIssuedMs: tokenIssuedMs(payload), ip: `198.51.100.${++ipSeq}` });
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

/** An access token as issued before tokens carried `iatMs`: `iat` in whole seconds only. */
function legacyAccessToken(userId: string, iat: number): string {
  const part = (v: object) => Buffer.from(JSON.stringify(v)).toString('base64url');
  const head = `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: userId, type: 'access', iat, exp: iat + 3600 })}`;
  return `${head}.${createHmac('sha256', process.env.JWT_SECRET!).update(head).digest('base64url')}`;
}

function codeHash(email: string, code: string) {
  return createHmac('sha256', process.env.JWT_SECRET!).update(`${email}:${code}`).digest('hex');
}

async function issueCode(email: string, code: string) {
  return db.emailLoginCode.create({
    data: { email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + 10 * 60_000) },
  });
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
    return 'OK';
  } catch (err) {
    return (err as { message?: string }).message?.split(':')[0] ?? 'ERR';
  }
}

describe('e-mail codes', () => {
  it('never compares more than the attempt cap, however many guesses run at once', async () => {
    const email = 'race@test.local';
    const row = await issueCode(email, '123456');
    // Each guess comes from its own address: only the per-code cap is under test here
    const results = await Promise.all(Array.from({ length: 25 }, (_, i) =>
      codeOf(caller(null, `203.0.113.${i + 1}`).auth.verifyEmailCode({ email, code: String(100000 + i).padStart(6, '0') }))));
    const stored = await db.emailLoginCode.findUniqueOrThrow({ where: { id: row.id } });
    expect(stored.attempts).toBe(EMAIL_CODE_MAX_ATTEMPTS);
    expect(results.filter((r) => r === 'INVALID_CODE').length).toBe(EMAIL_CODE_MAX_ATTEMPTS - 1);
    expect(results.every((r) => r === 'INVALID_CODE' || r === 'TOO_MANY_ATTEMPTS')).toBe(true);
    // The burnt code no longer works even when it is the right one
    expect(await codeOf(caller().auth.verifyEmailCode({ email, code: '123456' }))).toBe('TOO_MANY_ATTEMPTS');
  });

  it('signs in once when the right code is sent twice at the same time', async () => {
    const email = 'double@test.local';
    await issueCode(email, '654321');
    const results = await Promise.all([1, 2].map(() => codeOf(caller().auth.verifyEmailCode({ email, code: '654321' }))));
    expect(results.sort()).toEqual(['INVALID_CODE', 'OK']);
  });

  it('issues one code per address when requests arrive together', async () => {
    const email = 'burst@test.local';
    const before = sent.length;
    const results = await Promise.all(Array.from({ length: 6 }, () => codeOf(caller().auth.requestEmailCode({ email }))));
    expect(results.filter((r) => r === 'OK').length).toBe(1);
    expect(results.filter((r) => r === 'RESEND_TOO_SOON').length).toBe(5);
    expect(await db.emailLoginCode.count({ where: { email } })).toBe(1);
    expect(sent.length - before).toBe(1);
  });

  it('first proof of an address typed at password sign-up ends that password', async () => {
    const email = 'reserved@test.local';
    const user = await db.user.create({ data: { name: 'Reserved', email, passwordHash: await bcrypt.hash('squatter', 4) } });
    expect(await codeOf(caller().auth.loginWithEmail({ email, password: 'squatter' }))).toBe('OK');

    await issueCode(email, '111222');
    const signedIn = await caller().auth.verifyEmailCode({ email, code: '111222' });
    expect(signedIn.userId).toBe(user.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id }, omit: { passwordHash: false } });
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(after.passwordHash).toBeNull();
    expect(await codeOf(caller().auth.loginWithEmail({ email, password: 'squatter' }))).toBe('Invalid email or password');
  });

  it('ends every session issued before the first proof and keeps the ones the proof issued', async () => {
    const email = 'sessions@test.local';
    const user = await db.user.create({ data: { name: 'Squatted', email, passwordHash: await bcrypt.hash('squatter', 4) } });
    const squatter = await caller().auth.loginWithEmail({ email, password: 'squatter' });
    // The squatter's session works until the mailbox owner proves the address
    await callerWithToken(squatter.accessToken).user.me();
    await tick();

    await issueCode(email, '515151');
    const owner = await caller().auth.verifyEmailCode({ email, code: '515151' });
    expect(owner.userId).toBe(user.id);

    // Refresh, protected tRPC and the side routes (Gun handshake, admin REST) all refuse the old tokens
    expect(await codeOf(caller().auth.refresh({ refreshToken: squatter.refreshToken }))).toBe('Invalid refresh token');
    expect(await codeOf(callerWithToken(squatter.accessToken).user.me())).toBe('Session ended');
    const old = verifyToken(squatter.accessToken)!;
    expect(await isActiveAccount(db, user.id, tokenIssuedMs(old))).toBe(false);

    // The tokens issued by the proving request itself stay valid
    await callerWithToken(owner.accessToken).user.me();
    const renewed = await caller().auth.refresh({ refreshToken: owner.refreshToken });
    await callerWithToken(renewed.accessToken).user.me();
    expect(await isActiveAccount(db, user.id, tokenIssuedMs(verifyToken(owner.accessToken)!))).toBe(true);

    // The proof is dated once: a later sign-in by code moves nothing and ends no session
    const provenAt = (await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt;
    await issueCode(email, '616161');
    await caller().auth.verifyEmailCode({ email, code: '616161' });
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).emailVerifiedAt).toEqual(provenAt);
    await callerWithToken(owner.accessToken).user.me();
  });

  it('gives no tokens to a password sign-in whose password ended while it was being checked', async () => {
    const email = 'race-login@test.local';
    await db.user.create({ data: { name: 'Racing', email, passwordHash: await bcrypt.hash('squatter', 4) } });
    await issueCode(email, '717171');
    // The mailbox owner's proof commits while the squatter's password compare is still running
    const realCompare = bcrypt.compare.bind(bcrypt) as (a: string, b: string) => Promise<boolean>;
    const spy = vi.spyOn(bcrypt, 'compare').mockImplementationOnce((async (plain: string, hash: string) => {
      const ok = await realCompare(plain, hash);
      await caller().auth.verifyEmailCode({ email, code: '717171' });
      return ok;
    }) as never);
    try {
      expect(await codeOf(caller().auth.loginWithEmail({ email, password: 'squatter' }))).toBe('Invalid email or password');
    } finally {
      spy.mockRestore();
    }
  });

  it('keeps the sessions of the kept account when a proven address moves to it in a merge', async () => {
    const keep = await db.user.create({ data: { name: 'Keep', onboardingCompleted: true } });
    const keepToken = verifyToken((await caller().auth.refresh({ refreshToken: createRefreshToken(keep.id) })).accessToken)!;
    // A token from before the millisecond claim: whole seconds only, from the second the account was created
    const legacy = legacyAccessToken(keep.id, Math.floor(keep.createdAt.getTime() / 1000));
    await tick();
    const empty = await db.user.create({ data: { name: 'Empty', email: 'moved@test.local', emailVerifiedAt: new Date() } });
    await mergeEmptyAccountInto(db, empty.id, keep.id);
    const after = await db.user.findUniqueOrThrow({ where: { id: keep.id } });
    expect(after.email).toBe('moved@test.local');
    expect(after.emailVerifiedAt).not.toBeNull();
    expect(await isActiveAccount(db, keep.id, tokenIssuedMs(keepToken))).toBe(true);
    expect(await isActiveAccount(db, keep.id, tokenIssuedMs(verifyToken(legacy)!))).toBe(true);
    await callerWithToken(legacy).user.me();
  });

  it("keeps the proving request's tokens valid when the wall clock steps back afterwards", async () => {
    const email = 'clock@test.local';
    await db.user.create({ data: { name: 'Clock', email, passwordHash: await bcrypt.hash('squatter', 4) } });
    await issueCode(email, '919191');
    const owner = await caller().auth.verifyEmailCode({ email, code: '919191' });
    const realNow = Date.now.bind(Date);
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() - 30_000);
    try {
      await callerWithToken(owner.accessToken).user.me();
      const renewed = await caller().auth.refresh({ refreshToken: owner.refreshToken });
      await callerWithToken(renewed.accessToken).user.me();
    } finally {
      spy.mockRestore();
    }
  });

  it('checks expiry on the database clock when the attempt is reserved', async () => {
    const email = 'late@test.local';
    const row = await issueCode(email, '818181');
    await db.emailLoginCode.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 5_000) } });
    // The app's clock says the code is still fresh; the database says it is not
    const realNow = Date.now.bind(Date);
    const spy = vi.spyOn(Date, 'now').mockImplementation(() => realNow() - 60_000);
    let result: string;
    try {
      result = await codeOf(caller().auth.verifyEmailCode({ email, code: '818181' }));
    } finally {
      spy.mockRestore();
    }
    expect(result).toBe('CODE_EXPIRED');
    expect((await db.emailLoginCode.findUniqueOrThrow({ where: { id: row.id } })).attempts).toBe(0);
  });

  it('keeps the password of an account whose address was already proven', async () => {
    const email = 'legacy@test.local';
    await db.user.create({
      data: { name: 'Legacy', email, emailVerifiedAt: new Date(), passwordHash: await bcrypt.hash('mine', 4) },
    });
    await issueCode(email, '333444');
    await caller().auth.verifyEmailCode({ email, code: '333444' });
    expect(await codeOf(caller().auth.loginWithEmail({ email, password: 'mine' }))).toBe('OK');
  });
});

describe('session boundaries outside tRPC', () => {
  /** An account whose address the owner proves by code: a token from before the proof and the proof's own. */
  async function provenAccount(id: string, email: string, code: string) {
    await db.user.create({ data: { id, name: id, email, passwordHash: await bcrypt.hash('squatter', 4) } });
    const before = await caller().auth.loginWithEmail({ email, password: 'squatter' });
    await tick();
    await issueCode(email, code);
    const after = await caller().auth.verifyEmailCode({ email, code });
    expect(after.userId).toBe(id);
    return { before: before.accessToken, after: after.accessToken };
  }

  it("the admin REST check refuses a token from before the first proof and accepts the proof's own", async () => {
    const tokens = await provenAccount('sec-admin-boundary', 'admin-boundary@test.local', '242424');
    expect(await activeAdminFromAuthHeader(db, `Bearer ${tokens.before}`)).toEqual({ status: 403 });
    expect(await activeAdminFromAuthHeader(db, `Bearer ${tokens.after}`)).toEqual({ userId: 'sec-admin-boundary' });
    expect(await activeAdminFromAuthHeader(db, undefined)).toEqual({ status: 401 });
  });

  it("the Gun handshake refuses a token from before the first proof and accepts the proof's own", async () => {
    const tokens = await provenAccount('sec-gun-boundary', 'gun-boundary@test.local', '252525');
    const dir = mkdtempSync(join(tmpdir(), 'so-gun-db-'));
    const server = createServer();
    const sockets = new Set<Socket>();
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.once('close', () => sockets.delete(socket));
    });
    try {
      await startGunRelay(server, { file: join(dir, `data-${process.pid}-${Date.now()}`), db });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as AddressInfo).port;
      const WebSocket = createRequire(createRequire(import.meta.url).resolve('gun'))('ws') as new (url: string) => {
        once(event: 'open' | 'unexpected-response' | 'error', listener: (...args: unknown[]) => void): void;
        close(): void;
      };
      /** 'open', or the HTTP status the handshake was refused with. */
      const handshake = (token: string) => new Promise<string | number>((resolve) => {
        const ws = new WebSocket(`ws://127.0.0.1:${port}/gun?token=${token}`);
        ws.once('open', () => { ws.close(); resolve('open'); });
        ws.once('unexpected-response', (_req, res) => resolve((res as { statusCode: number }).statusCode));
        ws.once('error', () => resolve('error'));
      });
      expect(await handshake(tokens.before)).toBe(401);
      expect(await handshake(tokens.after)).toBe('open');
    } finally {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

describe('sign-in limits and retired procedures', () => {
  it('charges every sign-in call, also inside one batch', async () => {
    const ip = '192.0.2.200';
    const results = await Promise.all(Array.from({ length: 31 }, () =>
      codeOf(caller(null, ip).auth.loginWithEmail({ email: 'nobody@test.local', password: 'x' }))));
    expect(results.filter((r) => r === 'Too many sign-in attempts, try again later').length).toBe(1);
  });

  it('counts concurrent wrong link codes before the lookup', async () => {
    const ip = '192.0.2.201';
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) =>
      codeOf(caller(null, ip).auth.loginWithLinkCode({ code: String(900000 + i) }))));
    expect(results.filter((r) => r === 'Invalid or expired code').length).toBe(10);
    expect(results.filter((r) => r === 'Too many code attempts, try again later').length).toBe(5);
  });

  it('spends a link code once when two redemptions run at the same time', async () => {
    const owner = await db.user.create({ data: { name: 'Code owner', onboardingCompleted: true } });
    const expiresAt = new Date(Date.now() + 10 * 60_000);

    await db.linkingCode.create({ data: { userId: owner.id, code: '424242', expiresAt } });
    const logins = await Promise.all([1, 2].map(() => codeOf(caller().auth.loginWithLinkCode({ code: '424242' }))));
    expect(logins.sort()).toEqual(['Invalid or expired code', 'OK']);

    await db.linkingCode.create({ data: { userId: owner.id, code: '434343', expiresAt } });
    const apple = await Promise.all(['apple-1', 'apple-2'].map((sub) =>
      codeOf(findOrCreateAppleUser(db, { sub, email: null, email_verified: false }, 'A', '434343', [`ip:203.0.113.${++ipSeq}`]))));
    expect(apple.sort()).toEqual(['Invalid or expired link code', 'OK']);
    expect(await db.platformAccount.count({ where: { userId: owner.id, platform: 'APPLE' } })).toBe(1);

    await db.linkingCode.create({ data: { userId: owner.id, code: '454545', expiresAt } });
    const telegram = await Promise.all(['7001', '7002'].map((tgId) =>
      linkTelegramByCode(db, '454545', tgId, `init-${tgId}`, [`ip:203.0.113.${++ipSeq}`, `tg:${tgId}`])));
    expect(telegram.sort()).toEqual(['invalid', 'linked']);
    expect(await db.platformAccount.count({ where: { userId: owner.id, platform: 'TELEGRAM' } })).toBe(1);
    expect(await db.linkingCode.count({ where: { userId: owner.id } })).toBe(0);
  });

  it('limits sign-in calls per HTTP request, however the batch path is encoded', async () => {
    const app = Fastify();
    await registerTrpcApi(app, (opts) => ({ ...createContext(opts), db }));
    try {
      const body = (n: number) => JSON.stringify(Object.fromEntries(Array.from({ length: n }, (_, i) =>
        [String(i), { email: 'nobody@test.local', password: 'x' }])));
      const headers = { 'content-type': 'application/json', 'x-real-ip': '192.0.2.250' };

      // An ordinary mixed batch: two sign-in calls and a refresh
      const mixed = await app.inject({
        method: 'POST',
        url: '/trpc/auth.loginWithEmail,auth.refresh,auth.loginWithEmail?batch=1',
        headers,
        payload: JSON.stringify({ 0: { email: 'nobody@test.local', password: 'x' }, 1: { refreshToken: 'x' }, 2: { email: 'nobody@test.local', password: 'x' } }),
      });
      const answers = mixed.json() as Array<{ error?: { message: string } }>;
      expect(answers).toHaveLength(3);
      expect(answers.map((a) => a.error?.message)).toEqual(['Invalid email or password', 'Invalid refresh token', 'Invalid email or password']);

      // Three sign-in calls: refused before any of them runs
      const three = await app.inject({
        method: 'POST', url: '/trpc/auth.loginWithEmail,auth.loginWithEmail,auth.loginWithEmail?batch=1', headers, payload: body(3),
      });
      expect(three.statusCode).toBe(400);
      expect(three.json()).toEqual({ error: 'Too many sign-in calls in one request' });

      // A double-encoded comma slips past the path check; tRPC's own count refuses the third call
      const hidden = await app.inject({
        method: 'POST', url: '/trpc/auth.loginWithEmail%252Cauth.loginWithEmail%252Cauth.loginWithEmail?batch=1', headers, payload: body(3),
      });
      const hiddenAnswers = hidden.json() as Array<{ error?: { message: string } }>;
      expect(hiddenAnswers.map((a) => a.error?.message)).toEqual([
        'Invalid email or password', 'Invalid email or password', 'Too many sign-in calls in one request',
      ]);
    } finally {
      await app.close();
    }
  });

  it('refuses password sign-up and the link-code claim', async () => {
    expect(await codeOf(caller().auth.registerWithEmail({ email: 'new@test.local', password: 'secret1' })))
      .toBe('PASSWORD_SIGNUP_RETIRED');
    expect(await codeOf(caller().auth.claimWithLinkCode({ code: '123456', email: 'new@test.local', password: 'secret1' })))
      .toBe('CLAIM_RETIRED');
    expect(await db.user.count({ where: { email: 'new@test.local' } })).toBe(0);
  });
});

describe('Needs', () => {
  it('creates one active Need per type, however many requests arrive together', async () => {
    const author = await db.user.create({ data: { name: 'Racer', role: 'AUTHOR', onboardingCompleted: true } });
    const results = await Promise.all(Array.from({ length: 6 }, () =>
      codeOf(caller(author.id).collection.create({ type: 'EMERGENCY', amount: null, chatLink: 'https://t.me/race' }))));
    expect(results.filter((r) => r === 'OK').length).toBe(1);
    expect(await db.collection.count({ where: { creatorId: author.id, type: 'EMERGENCY', status: 'ACTIVE' } })).toBe(1);
  });

  it('shows amounts and the chat link by viewer role', async () => {
    const [author, p1, p2, gone, stranger] = await Promise.all(['Author', 'P1', 'P2', 'Gone', 'Stranger'].map((name) =>
      db.user.create({ data: { name, onboardingCompleted: true } })));
    const need = await db.collection.create({
      data: { creatorId: author!.id, type: 'EMERGENCY', amount: 100, chatLink: 'https://t.me/secret-chat' },
    });
    await db.obligation.createMany({
      data: [
        { collectionId: need.id, userId: p1!.id, amount: 10 },
        { collectionId: need.id, userId: p2!.id, amount: 20 },
        { collectionId: need.id, userId: gone!.id, amount: 30, unsubscribedAt: new Date() },
      ],
    });

    const view = (userId: string) => caller(userId).collection.getById({ id: need.id });
    const rowsOf = (v: Awaited<ReturnType<typeof view>>) =>
      v.obligations.map((o) => [o.user.name, o.amount] as const).sort();

    // The author and every active participant: everyone's names and amounts
    for (const viewer of [author!, p1!, p2!]) {
      const v = await view(viewer.id);
      expect(v.chatLink).toBe('https://t.me/secret-chat');
      expect(rowsOf(v)).toEqual([['P1', 10], ['P2', 20]]);
      expect(v.obligations.every((o) => typeof o.user.connectionCount === 'number')).toBe(true);
    }

    // Anyone else, including a person who declined: the names, no amounts, no chat; the totals stay
    for (const other of [gone!, stranger!]) {
      const v = await view(other.id);
      expect(v.chatLink).toBeNull();
      expect(rowsOf(v)).toEqual([['P1', null], ['P2', null]]);
      expect(JSON.stringify(v.obligations)).not.toMatch(/"amount":\d/);
      expect(v.obligations.map((o) => o.user.connectionCount)).toEqual([null, null]);
      expect(v.currentAmount).toBe(30);
      expect(v.participantCount).toBe(2);
      expect(v.amount).toBe(100);
    }

    // A notice alone does not reveal the chat either
    await db.notification.create({
      data: { userId: stranger!.id, collectionId: need.id, type: 'NEW_COLLECTION', expiresAt: new Date(Date.now() + 3_600_000) },
    });
    const notices = await caller(stranger!.id).notification.list({ limit: 20 });
    const notice = notices.items.find((n) => n.collectionId === need.id);
    expect(notice?.collection?.chatLink).toBeNull();
  });

  it('hides the chat from a participant while the page would: held, closed, renewal not confirmed', async () => {
    const [author, member] = await Promise.all(['Author 2', 'Member'].map((name) =>
      db.user.create({ data: { name, onboardingCompleted: true } })));
    const chat = 'https://t.me/renewal-chat';
    const cycleStart = new Date(Date.now() - 60_000);
    const need = await db.collection.create({
      data: { creatorId: author!.id, type: 'REGULAR', amount: 50, chatLink: chat, cycleNumber: 2, currentCycleStart: cycleStart },
    });
    // Joined before this cycle began: has to confirm it
    await db.obligation.create({ data: { collectionId: need.id, userId: member!.id, amount: 5, createdAt: new Date(Date.now() - 86_400_000) } });
    await db.notification.create({
      data: { userId: member!.id, collectionId: need.id, type: 'CYCLE_RENEWED', wave: 2, expiresAt: new Date(Date.now() + 3_600_000) },
    });

    const links = async () => {
      const m = caller(member!.id);
      const [page, participating, mine, notices] = await Promise.all([
        m.collection.getById({ id: need.id }),
        m.collection.myParticipating(),
        m.obligation.myList(),
        m.notification.list({ limit: 20 }),
      ]);
      return [
        page.chatLink,
        participating.find((r) => r.collectionId === need.id)?.collection.chatLink,
        mine.find((r) => r.collectionId === need.id)?.collection.chatLink,
        notices.items.find((n) => n.collectionId === need.id)?.collection?.chatLink,
      ];
    };

    expect(await links()).toEqual([null, null, null, null]);
    // The author always has the link
    expect((await caller(author!.id).collection.getById({ id: need.id })).chatLink).toBe(chat);

    // Confirmed the renewed cycle: the chat opens everywhere
    await db.notification.updateMany({ where: { userId: member!.id, collectionId: need.id }, data: { status: 'RESPONDED' } });
    const confirmed = await caller(member!.id).collection.getById({ id: need.id });
    expect(confirmed.chatLink).toBe(chat);
    const [, participating, mine] = await links();
    expect([participating, mine]).toEqual([chat, chat]);

    // Held by the circle, then closed: closed again
    await db.collection.update({ where: { id: need.id }, data: { blockReason: 'COMMUNITY' } });
    expect((await links()).slice(0, 3)).toEqual([null, null, null]);
    await db.collection.update({ where: { id: need.id }, data: { blockReason: null, status: 'CLOSED' } });
    expect((await links()).slice(0, 3)).toEqual([null, null, null]);
  });
});

describe('Web Push subscriptions', () => {
  const endpoint = (n: string) => `https://fcm.googleapis.com/fcm/send/${n}`;

  it('keeps at most ten per account, however many registrations run at once', async () => {
    const user = await db.user.create({ data: { name: 'Many browsers', onboardingCompleted: true } });
    const results = await Promise.all(Array.from({ length: 16 }, (_, i) =>
      codeOf(caller(user.id).push.subscribe({ endpoint: endpoint(`many-${i}`), p256dh: 'k', auth: 'a' }))));
    expect(results.every((r) => r === 'OK')).toBe(true);
    expect(await db.pushSubscription.count({ where: { userId: user.id } })).toBe(10);

    // The newest registration always stays, the oldest go
    await caller(user.id).push.subscribe({ endpoint: endpoint('latest'), p256dh: 'k', auth: 'a' });
    const kept = await db.pushSubscription.findMany({ where: { userId: user.id }, select: { endpoint: true } });
    expect(kept).toHaveLength(10);
    expect(kept.map((k) => k.endpoint)).toContain(endpoint('latest'));
  });

  it('lets one of two accounts take a contested endpoint, never both', async () => {
    const [u1, u2] = await Promise.all(['Push 1', 'Push 2'].map((name) =>
      db.user.create({ data: { name, onboardingCompleted: true } })));
    const results = await Promise.all([
      codeOf(caller(u1!.id).push.subscribe({ endpoint: endpoint('contested'), p256dh: 'k1', auth: 'a1' })),
      codeOf(caller(u2!.id).push.subscribe({ endpoint: endpoint('contested'), p256dh: 'k2', auth: 'a2' })),
    ]);
    expect(results.sort()).toEqual(['OK', 'Push endpoint belongs to another user']);
    // The stored row is whole: the owner and the keys of the same registration
    const row = await db.pushSubscription.findUniqueOrThrow({ where: { endpoint: endpoint('contested') } });
    expect([u1!.id, u2!.id]).toContain(row.userId);
    expect(row.p256dh).toBe(row.userId === u1!.id ? 'k1' : 'k2');
  });

  it('lets two accounts at the cap swap their oldest endpoints at the same time', async () => {
    // Each round: two full accounts, each taking over the other's oldest browser (same keys, so a move is allowed).
    // Each move prunes the mover's oldest row, which is the row the other side is moving.
    for (let round = 0; round < 5; round++) {
      const [ua, ub] = await Promise.all(['Swap A', 'Swap B'].map((name) =>
        db.user.create({ data: { name, onboardingCompleted: true } })));
      const base = Date.now() - 3_600_000;
      for (const [user, tag] of [[ua!, 'a'], [ub!, 'b']] as const) {
        await db.pushSubscription.createMany({
          data: Array.from({ length: 10 }, (_, i) => ({
            userId: user.id, endpoint: endpoint(`swap-${round}-${tag}${i}`), p256dh: `k-${tag}${i}`, auth: `a-${tag}${i}`,
            createdAt: new Date(base + i * 1000),
          })),
        });
      }
      const results = await Promise.all([
        codeOf(caller(ua!.id).push.subscribe({ endpoint: endpoint(`swap-${round}-b0`), p256dh: 'k-b0', auth: 'a-b0' })),
        codeOf(caller(ub!.id).push.subscribe({ endpoint: endpoint(`swap-${round}-a0`), p256dh: 'k-a0', auth: 'a-a0' })),
      ]);
      expect(results).toEqual(['OK', 'OK']);
      const ownerOf = async (n: string) =>
        (await db.pushSubscription.findUnique({ where: { endpoint: endpoint(`swap-${round}-${n}`) } }))?.userId;
      expect(await ownerOf('b0')).toBe(ua!.id);
      expect(await ownerOf('a0')).toBe(ub!.id);
      expect(await db.pushSubscription.count({ where: { userId: ua!.id } })).toBe(10);
      expect(await db.pushSubscription.count({ where: { userId: ub!.id } })).toBe(10);
    }
  }, 30_000);
});
