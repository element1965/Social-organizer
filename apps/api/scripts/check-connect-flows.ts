/**
 * Local end-to-end check of the three ways to connect: the personal invite link (request + confirmation),
 * the live QR (connected in person at once) and shake to connect. Real tRPC procedures against a LOCAL
 * database; Telegram calls are intercepted, nothing leaves the machine. Test users use the `e2e-` prefix and
 * are removed before and after.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=<local db> JWT_SECRET=<16+ chars> TELEGRAM_BOT_TOKEN=local-test npx tsx scripts/check-connect-flows.ts
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
if (!process.env.TELEGRAM_BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN is required (any value)'); process.exit(1); }
delete process.env.REDIS_URL;

const tgSent: Array<{ chatId: string; text: string }> = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url.includes('api.telegram.org')) {
    const body = JSON.parse(init?.body ?? '{}');
    if (url.includes('/sendMessage')) tgSent.push({ chatId: String(body.chat_id), text: String(body.text ?? '') });
    return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
  }
  if (/googleapis\.com|resend\.com/.test(url)) return new Response('{}', { status: 200 });
  return realFetch(input, init);
}) as typeof fetch;

const { appRouter } = await import('../src/routers/index.js');

const db = getDb();
const P = 'e2e-';
const id = (s: string) => `${P}${s}`;
const call = (userId: string, ip = '127.0.0.1') => appRouter.createCaller({ db, userId, ip } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const errOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => `${e?.code}:${e?.message}`);
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const connected = async (a: string, b: string) => (await db.connection.count({ where: pair(id(a), id(b)) })) === 1;
const chat = (who: string) => `${P}tg-${who}`;
const tgTo = (who: string) => tgSent.filter((m) => m.chatId === chat(who)).length;

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  const users = await db.user.findMany({ where: { id: { startsWith: P } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.notificationDelivery.deleteMany({ where: { userId: { in: ids } } });
  await db.connection.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.inviteLink.deleteMany({ where: { OR: [{ inviterId: { in: ids } }, { usedById: { in: ids } }] } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await (db as any).milestone?.deleteMany?.({ where: { userId: { in: ids } } }).catch(() => undefined);
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

/** Polls a shake ticket like the phone does, until it leaves "searching". */
async function waitShake(user: string, ticket: string, ip: string) {
  for (let i = 0; i < 40; i++) {
    const s: any = await call(id(user), ip).shake.status({ ticket });
    if (s.state !== 'searching') return s;
    await sleep(250);
  }
  return { state: 'timeout' };
}

async function main() {
  await cleanup();
  const people = ['anna', 'ben', 'cleo', 'dan', 'eva', 'fil', 'gil', 'hal', 'ivy', 'jon', 'kim', 'lea', 'max', 'del'];
  await db.user.createMany({
    data: people.map((p) => ({ id: id(p), name: `E2E ${p}`, language: 'en', onboardingCompleted: true, monthlyBudget: 50, remainingBudget: 50 }) as any),
  });
  await db.platformAccount.create({ data: { userId: id('anna'), platform: 'TELEGRAM', platformId: chat('anna') } });
  await db.user.update({ where: { id: id('anna') }, data: { referralSlug: 'e2e-anna' } });
  await db.user.update({ where: { id: id('del') }, data: { deletedAt: new Date() } });

  console.log('\n— Personal link (request, then confirmation)');
  tgSent.length = 0;
  const r1: any = await call(id('ben')).invite.accept({ token: id('anna') });
  await sleep(300);
  check('link by id → pending request, not a connection', r1.pending === true && !(await connected('ben', 'anna')), JSON.stringify(r1));
  check('the inviter gets one Telegram message', tgTo('anna') === 1, `tg=${tgTo('anna')}`);
  const inc: any[] = await call(id('anna')).pending.incoming();
  const benReq = inc.find((p) => p.fromUserId === id('ben') || p.fromUser?.id === id('ben'));
  check('the request is in the inviter\'s incoming list', !!benReq, `incoming=${inc.length}`);
  tgSent.length = 0;
  const r1b: any = await call(id('ben')).invite.accept({ token: id('anna') });
  await sleep(300);
  const rows = await db.pendingConnection.count({ where: { fromUserId: id('ben'), toUserId: id('anna') } });
  check('opening the link again → still one request, no second message', r1b.pending === true && rows === 1 && tgTo('anna') === 0, `rows=${rows} tg=${tgTo('anna')}`);
  await call(id('anna')).pending.accept({ pendingId: benReq.id });
  check('inviter confirms → connected', await connected('ben', 'anna'));
  const benCount: any = await call(id('ben')).connection.getCount();
  check('the newcomer counts the connection', benCount.count === 1, `count=${benCount.count}`);
  const r1c: any = await call(id('ben')).invite.accept({ token: id('anna') });
  check('link once connected → alreadyConnected, nothing created', r1c.alreadyConnected === true, JSON.stringify(r1c));
  check('own link → refused', (await errOf(call(id('anna')).invite.accept({ token: id('anna') })))?.includes('yourself') === true);
  check('unknown link → NOT_FOUND', (await errOf(call(id('ben')).invite.accept({ token: 'no-such-person' })))?.startsWith('NOT_FOUND') === true);
  check('deleted inviter → INVITER_DELETED', (await errOf(call(id('ben')).invite.accept({ token: id('del') }))) === 'NOT_FOUND:INVITER_DELETED');

  const r2: any = await call(id('cleo')).invite.accept({ token: 'E2E-ANNA' });
  check('link by slug, any case → pending request', r2.pending === true, JSON.stringify(r2));
  const cleoReq = await db.pendingConnection.findFirst({ where: { fromUserId: id('cleo'), toUserId: id('anna') } });
  await call(id('anna')).pending.reject({ pendingId: cleoReq!.id });
  tgSent.length = 0;
  const r2b: any = await call(id('cleo')).invite.accept({ token: 'e2e-anna' }).catch((e: any) => ({ error: e.message }));
  await sleep(300);
  const cleoAfter = await db.pendingConnection.findFirst({ where: { fromUserId: id('cleo'), toUserId: id('anna') } });
  check('after a decline, opening the link again does not ask the inviter again',
    cleoAfter?.status === 'REJECTED' && tgTo('anna') === 0, `result=${JSON.stringify(r2b)} status=${cleoAfter?.status} tg=${tgTo('anna')}`);
  const direct = await errOf(call(id('cleo')).pending.sendDirectRequest({ targetUserId: id('anna') }));
  check('after a decline, a direct request is refused clearly', direct === 'CONFLICT:Request declined', String(direct));

  // Withdrawn a moment ago: the link waits out the same cooldown as a direct request
  await call(id('jon')).pending.sendDirectRequest({ targetUserId: id('anna') });
  await call(id('jon')).pending.cancel({ targetUserId: id('anna') });
  const cool = await errOf(call(id('jon')).invite.accept({ token: id('anna') }));
  check('withdrawn a moment ago → the link also waits (cooldown)', cool === 'TOO_MANY_REQUESTS:REQUEST_COOLDOWN', String(cool));

  // Names with HTML characters reach Telegram escaped
  tgSent.length = 0;
  await db.user.update({ where: { id: id('kim') }, data: { name: '<3 Kim & Co' } });
  await call(id('kim')).invite.accept({ token: id('anna') });
  await sleep(300);
  const msg = tgSent.find((m) => m.chatId === chat('anna'))?.text ?? '';
  check('a name with < and & is escaped for Telegram', msg.includes('&lt;3 Kim &amp; Co') && !msg.includes('<3'), msg.slice(0, 80));

  // Inviter already asked the newcomer: opening the link counts as the answer
  await call(id('anna')).pending.sendDirectRequest({ targetUserId: id('dan') });
  const r3: any = await call(id('dan')).invite.accept({ token: id('anna') });
  check('reverse request exists → link connects at once', await connected('dan', 'anna'), JSON.stringify(r3));

  console.log('\n— Live QR (in person, connected at once)');
  const qr: any = await call(id('anna')).invite.generate({ ttl: 60 });
  const r4: any = await call(id('eva')).invite.accept({ token: qr.token });
  check('QR scan → connected immediately', r4.pending !== true && (await connected('eva', 'anna')), JSON.stringify(r4));
  check('the same QR by someone else → "already used"', (await errOf(call(id('fil')).invite.accept({ token: qr.token }))) === 'BAD_REQUEST:Invite already used');
  const r4b: any = await call(id('eva')).invite.accept({ token: qr.token });
  check('the same person scans again → alreadyConnected', r4b.alreadyConnected === true, JSON.stringify(r4b));
  const old: any = await call(id('anna')).invite.generate({ ttl: 60 });
  await db.inviteLink.update({ where: { token: old.token }, data: { expiresAt: new Date(Date.now() - 1000) } });
  const exp = await errOf(call(id('fil')).invite.accept({ token: old.token }));
  check('expired QR scanned in the app → expired error, no connection', exp?.startsWith('NOT_FOUND') === true && !(await connected('fil', 'anna')), String(exp));
  const page: any = await appRouter.createCaller({ db, userId: null, ip: '127.0.0.1' } as any).invite.getByToken({ token: old.token });
  check('expired QR still shows the inviter on the guest page', page.expired === true && page.inviter?.id === id('anna'), JSON.stringify({ expired: page.expired }));
  const late: any = await call(id('fil')).invite.accept({ token: old.token, viaLink: true });
  check('expired QR accepted from the guest page (slow sign-up) → an ordinary request', late.pending === true && !(await connected('fil', 'anna')), JSON.stringify(late));
  const usedPage: any = await appRouter.createCaller({ db, userId: id('fil'), ip: '127.0.0.1' } as any).invite.getByToken({ token: qr.token });
  check('guest page never sends another person id', usedPage.usedById === 'someone-else', String(usedPage.usedById));
  check('own QR → refused', (await errOf(call(id('anna')).invite.accept({ token: (await call(id('anna')).invite.generate({ ttl: 60 })).token })))?.includes('own') === true);

  console.log('\n— Shake to connect');
  const ipA = '10.9.0.1';
  const [tG, tH] = await Promise.all([call(id('gil'), ipA).shake.register(), call(id('hal'), ipA).shake.register()]);
  const [sG, sH] = await Promise.all([waitShake('gil', tG.ticket, ipA), waitShake('hal', tH.ticket, ipA)]);
  check('two shakes from one network → matched to each other',
    sG.state === 'matched' && sH.state === 'matched' && sG.person?.id === id('hal') && sH.person?.id === id('gil'), `${sG.state}/${sH.state}`);
  const a1: any = await call(id('gil'), ipA).shake.respond({ pairId: sG.pairId, accept: true });
  check('first accept → waiting for the other', a1.pairState === 'waiting' && !(await connected('gil', 'hal')), a1.pairState);
  const a2: any = await call(id('hal'), ipA).shake.respond({ pairId: sH.pairId, accept: true });
  check('second accept → connected', a2.pairState === 'connected' && (await connected('gil', 'hal')), a2.pairState);
  const sG2: any = await call(id('gil'), ipA).shake.status({ ticket: tG.ticket });
  check('the first phone sees "connected" on its next poll', sG2.pairState === 'connected', sG2.pairState);
  check('a fresh shake connection is not reported as "already connected" on either phone', a2.alreadyConnected === false && sG2.alreadyConnected === false, `respond=${a2.alreadyConnected} poll=${sG2.alreadyConnected}`);

  const ipB = '10.9.0.2';
  const [tI, tJ] = await Promise.all([call(id('ivy'), ipB).shake.register(), call(id('jon'), ipB).shake.register()]);
  const [sI] = await Promise.all([waitShake('ivy', tI.ticket, ipB), waitShake('jon', tJ.ticket, ipB)]);
  await call(id('ivy'), ipB).shake.respond({ pairId: sI.pairId, accept: true });
  const d2: any = await call(id('jon'), ipB).shake.respond({ pairId: sI.pairId, accept: false });
  check('one declines → declined, no connection', d2.pairState === 'declined' && !(await connected('ivy', 'jon')), d2.pairState);

  const ipC = '10.9.0.3';
  const tickets = await Promise.all(['kim', 'lea', 'max'].map((p) => call(id(p), ipC).shake.register()));
  const states = await Promise.all(['kim', 'lea', 'max'].map((p, i) => waitShake(p, tickets[i]!.ticket, ipC)));
  check('three shakes at once in one place → crowded for all', states.every((s: any) => s.state === 'crowded'), states.map((s: any) => s.state).join(','));

  const [tG3, tH3] = await Promise.all([call(id('gil'), '10.9.0.4').shake.register(), call(id('hal'), '10.9.0.4').shake.register()]);
  const sG3: any = await waitShake('gil', tG3.ticket, '10.9.0.4');
  await waitShake('hal', tH3.ticket, '10.9.0.4');
  check('already connected pair → told so', sG3.state === 'matched' && sG3.alreadyConnected === true, `${sG3.state} already=${sG3.alreadyConnected}`);

  // Two shakes with no shared network and no geo: paired blind, nobody shown before the code is confirmed
  await db.connection.deleteMany({ where: pair(id('ivy'), id('max')) });
  await sleep(3500); // a weak pair needs no other shake anywhere in the 3 s window
  const [tW1, tW2] = await Promise.all([call(id('ivy'), '10.20.0.1').shake.register(), call(id('max'), '10.30.0.1').shake.register()]);
  const [w1, w2]: any[] = await Promise.all([waitShake('ivy', tW1.ticket, '10.20.0.1'), waitShake('max', tW2.ticket, '10.30.0.1')]);
  check('no shared network, no geo → weak pair with the person hidden on both phones',
    w1.state === 'matched' && w1.weak === true && w1.person === null && w2.person === null, `${w1.state} weak=${w1.weak} person=${JSON.stringify(w1.person)}`);
  check('both phones get the same three-symbol code', Array.isArray(w1.code) && w1.code.length === 3 && w1.code.join() === w2.code?.join(), `${w1.code?.join('')} / ${w2.code?.join('')}`);
  const wa: any = await call(id('ivy'), '10.20.0.1').shake.respond({ pairId: w1.pairId, accept: true });
  check('one confirmed the code → still nobody shown', wa.person === null && wa.pairState === 'waiting', `${wa.pairState}`);
  const wb: any = await call(id('max'), '10.30.0.1').shake.respond({ pairId: w2.pairId, accept: true });
  const wa2: any = await call(id('ivy'), '10.20.0.1').shake.status({ ticket: tW1.ticket });
  check('both confirmed → connected, and only now each sees who it is',
    wb.pairState === 'connected' && wb.person?.id === id('ivy') && wa2.person?.id === id('max') && (await connected('ivy', 'max')), `${wb.pairState}`);
  await sleep(3500);
  const [tW3, tW4] = await Promise.all([call(id('lea'), '10.40.0.1').shake.register(), call(id('fil'), '10.50.0.1').shake.register()]);
  const [w3]: any[] = await Promise.all([waitShake('lea', tW3.ticket, '10.40.0.1'), waitShake('fil', tW4.ticket, '10.50.0.1')]);
  const wd: any = await call(id('lea'), '10.40.0.1').shake.respond({ pairId: w3.pairId, accept: false });
  const wd2: any = await call(id('fil'), '10.50.0.1').shake.status({ ticket: tW4.ticket });
  check('a different code → declined, and who it was is never shown', wd.pairState === 'declined' && wd.person === null && wd2.person === null, wd.pairState);

  // Phones on one Wi-Fi with IPv6: each has its own address in the same /64
  const v6a = '2a02:8109:b6c0:1d00:1111:2222:3333:4444';
  const v6b = '2a02:8109:b6c0:1d00:aaaa:bbbb:cccc:dddd';
  const [t6a, t6b] = await Promise.all([call(id('kim'), v6a).shake.register(), call(id('jon'), v6b).shake.register()]);
  const [s6]: any[] = await Promise.all([waitShake('kim', t6a.ticket, v6a), waitShake('jon', t6b.ticket, v6b)]);
  check('IPv6 in one /64 → a strong pair, the person shown at once', s6.state === 'matched' && s6.weak === false && s6.person?.id === id('jon'), `weak=${s6.weak}`);

  const ipE = '10.9.0.5';
  const tLone = await call(id('fil'), ipE).shake.register();
  const lone: any = await waitShake('fil', tLone.ticket, ipE);
  check('a lone shake → nobody found after the search', lone.state === 'none' || lone.state === 'timeout', lone.state);
  check('someone else\'s ticket → NOT_FOUND', (await errOf(call(id('ben')).shake.status({ ticket: tG.ticket })))?.startsWith('NOT_FOUND') === true);
  check('someone else\'s pair → NOT_FOUND', (await errOf(call(id('ben')).shake.respond({ pairId: sG.pairId, accept: true })))?.startsWith('NOT_FOUND') === true);
}

try {
  await main();
} finally {
  await cleanup();
  await db.$disconnect();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
