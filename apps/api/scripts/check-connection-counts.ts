/**
 * Local check of SO-15: one definition of a confirmed acquaintance (Connection rows) for the SOS
 * threshold, the 150 limit and the account deletion scenario. Runs the real tRPC procedures against a
 * LOCAL database: boundaries 0 / 9 / 10 / 149 / 150, parallel confirmations, repeats, deletion.
 *
 * Telegram calls are intercepted (global fetch is stubbed) — nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/<db> npx tsx scripts/check-connection-counts.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "so15-").
 */
import { getDb } from '@so/db';
import { appRouter } from '../src/routers/index.js';
import { removeBlockedUser } from '../src/services/telegram-bot.service.js';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('api.telegram.org') || url.includes('googleapis.com')) {
    return new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });
  }
  return realFetch(input, init);
}) as typeof fetch;

const db = getDb();
const P = 'so15-';
const id = (s: string) => `${P}${s}`;
const caller = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

const rows: Array<[string, string, string, string]> = []; // case, data, number, decision
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}
async function errorOf(p: Promise<unknown>): Promise<string | null> {
  try { await p; return null; } catch (e: any) { return e?.message ?? String(e); }
}

async function cleanup() {
  const ids = (await db.user.findMany({ where: { id: { startsWith: P } }, select: { id: true } })).map((u) => u.id);
  if (!ids.length) return;
  await db.collection.deleteMany({ where: { creatorId: { in: ids } } });
  await db.connection.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.inviteLink.deleteMany({ where: { OR: [{ inviterId: { in: ids } }, { usedById: { in: ids } }] } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function connect(a: string, others: string[]) {
  await db.connection.createMany({ data: others.map((o) => pair(a, o)), skipDuplicates: true });
}

async function main() {
  await cleanup();

  // 320 fillers + the people under test
  const names = ['zero', 'nine', 'ten', 'x', 'y', 'u1', 'u2', 'full', 'other', 'sos', 'delConn', 'delPending', 'delNone', 'author', 'dev', 'tgConn', 'tgInv', 'tgNone'];
  await db.user.createMany({
    data: [
      ...Array.from({ length: 320 }, (_, i) => ({ id: id(`f${String(i).padStart(3, '0')}`), name: `Filler ${i}` })),
      ...names.map((n) => ({ id: id(n), name: n })),
    ],
  });
  const f = (i: number) => id(`f${String(i).padStart(3, '0')}`);
  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => f(from + i));
  const chat = 'https://t.me/so15check';

  // --- 0: ten used invite links and ten pending requests, no connections
  for (let i = 0; i < 10; i++) {
    await db.inviteLink.create({ data: { inviterId: id('zero'), token: `${P}tok-${i}`, usedById: f(300 + i), usedAt: new Date() } });
    await db.pendingConnection.create({ data: { fromUserId: f(310 + i), toUserId: id('zero') } });
  }
  {
    const n = (await caller(id('zero')).connection.getCount()).count;
    const err = await errorOf(caller(id('zero')).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: chat }));
    check('0 connections + 10 used invites + 10 pending → count 0, SOS refused', n === 0 && !!err?.includes('You have 0'), `count=${n}; ${err}`);
    rows.push(['0', '0 Connection, 10 used invite links, 10 pending requests', String(n), err ? 'SOS refused (0/10)' : 'SOS allowed']);
  }

  // --- 9: connections on both sides of the pair, plus pending requests
  await connect(id('nine'), range(0, 9)); // ids "so15-f…" < "so15-nine" and > for some — both sides used
  for (let i = 0; i < 10; i++) await db.pendingConnection.create({ data: { fromUserId: f(310 + i), toUserId: id('nine') } });
  {
    const n = (await caller(id('nine')).connection.getCount()).count;
    const err = await errorOf(caller(id('nine')).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: chat }));
    check('9 connections + 10 pending → count 9, SOS refused', n === 9 && !!err?.includes('You have 9'), `count=${n}; ${err}`);
    rows.push(['9', '9 Connection, 10 pending requests', String(n), err ? 'SOS refused (9/10)' : 'SOS allowed']);
  }

  // --- 10: connections only, no invite links at all
  await connect(id('ten'), range(20, 10));
  {
    const n = (await caller(id('ten')).connection.getCount()).count;
    const err = await errorOf(caller(id('ten')).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: chat }));
    check('10 connections, 0 invite links → count 10, SOS allowed', n === 10 && err === null, `count=${n}; ${err ?? 'created'}`);
    rows.push(['10', '10 Connection, 0 invite links', String(n), err ? `SOS refused: ${err}` : 'SOS allowed (collection created)']);
  }

  // --- 149 → 150 with two parallel confirmations
  await connect(id('x'), range(40, 149));
  await db.pendingConnection.create({ data: { fromUserId: id('u1'), toUserId: id('x') } });
  await db.pendingConnection.create({ data: { fromUserId: id('u2'), toUserId: id('x') } });
  const pend = await db.pendingConnection.findMany({ where: { toUserId: id('x') }, select: { id: true } });
  {
    const before = (await caller(id('x')).connection.getCount()).count;
    const results = await Promise.allSettled(pend.map((p) => caller(id('x')).pending.accept({ pendingId: p.id })));
    const ok = results.filter((r) => r.status === 'fulfilled').length;
    const errs = results.filter((r) => r.status === 'rejected').map((r: any) => r.reason?.message);
    const after = (await caller(id('x')).connection.getCount()).count;
    check('149 + two parallel confirmations → exactly one passes, count 150', before === 149 && ok === 1 && after === 150,
      `before=${before} ok=${ok} after=${after} errors=${errs.join(',')}`);
    rows.push(['149', '149 Connection, 2 requests confirmed at the same time', `${before} → ${after}`, `1 accepted, 1 refused (${errs[0]})`]);

    const stillPending = await db.pendingConnection.count({ where: { toUserId: id('x'), status: 'PENDING' } });
    check('the refused request stays pending (status change rolled back)', stillPending === 1, `pending=${stillPending}`);
  }

  // --- repeat of an accepted request: no second connection
  {
    const accepted = await db.pendingConnection.findFirst({ where: { toUserId: id('x'), status: 'ACCEPTED' }, select: { id: true, fromUserId: true } });
    const res: any = await caller(id('x')).pending.accept({ pendingId: accepted!.id });
    const n = await db.connection.count({ where: pair(id('x'), accepted!.fromUserId) });
    check('repeat accept → no-op, one connection', n === 1, `result=${JSON.stringify(res)?.slice(0, 80)} rows=${n}`);
    rows.push(['150', 'repeat of the accepted request', '150', 'no-op, still one Connection']);
  }

  // --- 150 on the other side: the request sender is full
  await connect(id('full'), range(40, 150));
  await db.pendingConnection.create({ data: { fromUserId: id('full'), toUserId: id('other') } });
  {
    const p = await db.pendingConnection.findFirst({ where: { fromUserId: id('full'), toUserId: id('other') }, select: { id: true } });
    const err = await errorOf(caller(id('other')).pending.accept({ pendingId: p!.id }));
    check('sender at 150 → accept refused with CONNECTION_LIMIT_OTHER', !!err?.includes('CONNECTION_LIMIT_OTHER'), String(err));
    rows.push(['150', 'request from a person who has 150', '150', `refused (${err})`]);
  }

  // --- SOS link does not bypass the limit
  await db.collection.create({ data: { creatorId: id('full'), type: 'EMERGENCY', amount: 100, chatLink: chat, status: 'ACTIVE' } as any });
  {
    const col = await db.collection.findFirst({ where: { creatorId: id('full') }, select: { id: true } });
    const err = await errorOf(caller(id('sos')).invite.acceptSos({ collectionId: col!.id }));
    const n = await db.connection.count({ where: pair(id('sos'), id('full')) });
    check('SOS link to an author with 150 → refused, no connection', !!err?.includes('CONNECTION_LIMIT_OTHER') && n === 0, `${err}; rows=${n}`);
    rows.push(['150', 'SOS link to an author who has 150', '150', `refused (${err})`]);
  }

  // --- one-sided add no longer exists
  {
    const err = await errorOf((caller(id('y')).connection as any).add({ userId: f(0) }));
    const n = await db.connection.count({ where: pair(id('y'), f(0)) });
    check('connection.add is not available (no one-sided connections)', !!err && n === 0, String(err));
  }

  // --- deletion scenario by real connections
  await connect(id('delConn'), [f(0)]);
  await db.pendingConnection.create({ data: { fromUserId: f(1), toUserId: id('delPending') } });
  for (const [who, expect] of [['delConn', 'soft'], ['delPending', 'hard'], ['delNone', 'hard']] as const) {
    await caller(id(who)).user.delete();
    const u = await db.user.findUnique({ where: { id: id(who) }, select: { deletedAt: true } });
    const got = u ? (u.deletedAt ? 'soft' : 'kept') : 'hard';
    check(`delete ${who} → ${expect}`, got === expect, `got=${got}`);
    rows.push(['delete', who === 'delConn' ? '1 Connection, 0 invite links' : who === 'delPending' ? '0 Connection, 1 pending request' : 'nothing', '', `${got === 'soft' ? 'muted (account with connections)' : 'deleted without traces'}`]);
  }

  // --- special profiles keep their exception: no SOS threshold
  await db.user.update({ where: { id: id('author') }, data: { role: 'AUTHOR' } });
  await db.user.update({ where: { id: id('dev') }, data: { role: 'DEVELOPER' } });
  for (const who of ['author', 'dev']) {
    const n = (await caller(id(who)).connection.getCount()).count;
    const err = await errorOf(caller(id(who)).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: chat }));
    check(`${who} (special role) with 0 connections → SOS allowed`, n === 0 && err === null, `count=${n}; ${err ?? 'created'}`);
    rows.push(['special', `${who === 'author' ? 'AUTHOR' : 'DEVELOPER'} role, 0 Connection`, String(n), err ? `refused: ${err}` : 'SOS allowed (exception kept)']);
  }

  // --- Telegram "bot blocked" cleanup follows the same deletion rule
  await connect(id('tgConn'), [f(2)]);
  await db.inviteLink.create({ data: { inviterId: id('tgInv'), token: `${P}tok-tg`, usedById: f(3), usedAt: new Date() } });
  await db.pendingConnection.create({ data: { fromUserId: f(4), toUserId: id('tgNone') } });
  const tgCases = [['tgConn', 'soft', '1 Connection'], ['tgInv', 'soft', '0 Connection, 1 invitee'], ['tgNone', 'hard', '0 Connection, 1 pending request']] as const;
  for (const [i, [who, expect, data]] of tgCases.entries()) {
    const chatId = `${P}tg${i}`;
    await db.platformAccount.create({ data: { userId: id(who), platform: 'TELEGRAM', platformId: chatId } });
    await removeBlockedUser(chatId);
    const u = await db.user.findUnique({ where: { id: id(who) }, select: { deletedAt: true } });
    const got = u ? (u.deletedAt ? 'soft' : 'kept') : 'hard';
    check(`bot blocked by ${who} → ${expect}`, got === expect, `got=${got}`);
    rows.push(['bot blocked', data, '', got === 'soft' ? 'muted' : got === 'hard' ? 'deleted without traces' : 'kept (error)']);
  }

  console.log('\n| Case | Data | Number | Server decision |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);

  await cleanup();
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error(e);
  await cleanup().catch(() => {});
  process.exit(1);
});
