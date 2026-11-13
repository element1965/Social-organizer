/**
 * Local check of SO-45: one external notification per event, through the person's one channel.
 * Real tRPC procedures, services and the renewal worker against a LOCAL database. Telegram calls are
 * intercepted (global fetch is stubbed) and counted per chat; nothing leaves the machine.
 *
 * Covers: repeat and race of one event, channel change, explicit Telegram without a linked account,
 * "new collections" switch, later wave (RE_NOTIFY), grouped responses, responses already seen,
 * collection close, connection request and its answer, regular-cycle reminder with unsubscribe and switch,
 * push texts without names/amounts/contacts, participation without push.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=<local db> JWT_SECRET=<16+ chars> TELEGRAM_BOT_TOKEN=local-test npx tsx scripts/check-notifications.ts
 */
import { readFileSync } from 'fs';
import { getDb } from '@so/db';
import { REGULAR_CYCLE_DAYS } from '@so/shared';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
if (!process.env.TELEGRAM_BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN is required (any value)'); process.exit(1); }
delete process.env.REDIS_URL; // responses are grouped by a timer here; the digest itself is called directly

// ---- Intercept Telegram ----
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
const notify = await import('../src/services/notification.service.js');
const { processCycleRenewalReminder } = await import('../src/workers/cycle-renewal-reminder.worker.js');

const db = getDb();
const P = 'so45-';
const id = (s: string) => `${P}${s}`;
const call = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const chat = (who: string) => `${P}tg-${who}`;
const tgTo = (who: string) => tgSent.filter((m) => m.chatId === chat(who));
const deliveries = (who: string, prefix: string) =>
  db.notificationDelivery.findMany({ where: { userId: id(who), eventKey: { startsWith: prefix } } });
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

let failed = 0;
const rows: string[][] = [];
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  const ids = (await db.user.findMany({ where: { id: { startsWith: P } }, select: { id: true } })).map((u) => u.id);
  if (!ids.length) return;
  const cols = (await db.collection.findMany({ where: { creatorId: { in: ids } }, select: { id: true } })).map((c) => c.id);
  await db.notification.deleteMany({ where: { OR: [{ userId: { in: ids } }, { collectionId: { in: cols } }] } });
  await db.obligation.deleteMany({ where: { OR: [{ userId: { in: ids } }, { collectionId: { in: cols } }] } });
  await db.collection.deleteMany({ where: { id: { in: cols } } });
  await db.connection.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.inviteLink.deleteMany({ where: { OR: [{ inviterId: { in: ids } }, { usedById: { in: ids } }] } });
  await db.pushSubscription.deleteMany({ where: { userId: { in: ids } } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.notificationDelivery.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function main() {
  await cleanup();
  // A: author, Telegram only. B: Telegram + browser push. C: Telegram, new collections off.
  // D: nothing linked. E: Telegram. G: newcomer with Telegram.
  const people = ['a', 'b', 'c', 'd', 'e', 'g'];
  await db.user.createMany({
    data: people.map((p) => ({ id: id(p), name: `Person ${p.toUpperCase()}`, language: 'en', onboardingCompleted: true, monthlyBudget: 50, remainingBudget: 50 }) as any),
  });
  // A regular author with 10 confirmed connections (b, c, d, e + 6 more without any channel)
  await db.user.createMany({ data: Array.from({ length: 6 }, (_, i) => ({ id: id(`f${i}`), name: `Filler ${i}`, language: 'en' })) });
  await db.connection.createMany({ data: Array.from({ length: 6 }, (_, i) => pair(id('a'), id(`f${i}`))) });
  await db.user.update({ where: { id: id('c') }, data: { notifyNewCollections: false } });
  for (const p of ['a', 'b', 'c', 'e', 'g']) {
    await db.platformAccount.create({ data: { userId: id(p), platform: 'TELEGRAM', platformId: chat(p) } });
  }
  await db.pushSubscription.create({ data: { userId: id('b'), endpoint: `https://push.invalid/${P}b`, p256dh: 'x', auth: 'y' } as any });
  await db.connection.createMany({ data: ['b', 'c', 'd', 'e'].map((p) => pair(id('a'), id(p))) });

  // --- 1. One event, repeated and raced: one message
  await Promise.all(Array.from({ length: 5 }, () => notify.sendPendingNotification(db, id('a'), 'new', 'Person X', undefined, `${P}pending-race`)));
  await notify.sendPendingNotification(db, id('a'), 'new', 'Person X', undefined, `${P}pending-race`);
  check('same event ×6 (5 in parallel) → one Telegram message', tgTo('a').length === 1, `messages=${tgTo('a').length}`);
  rows.push(['Connection request (repeat / race)', 'Telegram', 'unique event key', '6 calls → 1 message']);

  // --- 2. Channel resolution and change
  const auto = await call(id('a')).settings.get();
  const autoB = await call(id('b')).settings.get();
  check('automatic channel: Telegram only → Telegram, Telegram + push → app', auto.effectiveChannel === 'TELEGRAM' && autoB.effectiveChannel === 'APP',
    `a=${auto.effectiveChannel} b=${autoB.effectiveChannel}`);
  await call(id('a')).settings.updateNotifyChannel({ channel: 'APP' });
  const before = tgTo('a').length;
  await notify.sendUserDeletedNotification(db, id('a'), 'Someone', `${P}left-1`);
  const appRows = await deliveries('a', `left:${P}left-1`);
  check('channel changed to app → nothing in Telegram, one app delivery', tgTo('a').length === before && appRows.length === 1 && appRows[0]!.channel === 'APP',
    `tg+${tgTo('a').length - before}, rows=${appRows.map((r) => r.channel).join(',')}`);
  await call(id('a')).settings.updateNotifyChannel({ channel: 'TELEGRAM' });
  await notify.sendUserDeletedNotification(db, id('a'), 'Someone', `${P}left-2`);
  check('channel back to Telegram → one Telegram message', tgTo('a').length === before + 1, `tg+${tgTo('a').length - before}`);
  const noTg = await call(id('d')).settings.updateNotifyChannel({ channel: 'TELEGRAM' }).then(() => null, (e: any) => e.message);
  check('Telegram cannot be chosen without a linked account', noTg === 'TELEGRAM_NOT_LINKED', String(noTg));
  rows.push(['Channel change', 'app ↔ Telegram', 'only the chosen channel', 'checked both ways']);

  // --- 3. New collection: one channel per person, switch respected
  tgSent.length = 0;
  const col = await call(id('a')).collection.create({ type: 'EMERGENCY', amount: 100, chatLink: 'https://t.me/so45check' });
  await sleep(1500);
  const inApp = await db.notification.findMany({ where: { collectionId: col.id }, select: { userId: true } });
  const notified = new Set(inApp.map((n) => n.userId));
  const bRows = await deliveries('b', `col:${col.id}`);
  const cRows = await deliveries('c', `col:${col.id}`);
  const dRows = await deliveries('d', `col:${col.id}`);
  check('new collection reached b, c, d, e in the app journal', ['b', 'c', 'd', 'e'].every((p) => notified.has(id(p))), `notified=${[...notified].length}`);
  check('b (app channel): app delivery, no Telegram', bRows.length === 1 && bRows[0]!.channel === 'APP' && tgTo('b').length === 0);
  check('c (new collections off): no external message, entry stays in the app', cRows.length === 0 && tgTo('c').length === 0 && notified.has(id('c')));
  // Behaviour routing (docs/notifications/behaviour-routing.md): a person no channel reaches outside the app
  // gets the in-app entry only and does not take a slot of the wave, so no delivery row is written for them
  check('d (no Telegram, no push): in-app entry only, no external delivery', dRows.length === 0 && tgTo('d').length === 0 && notified.has(id('d')),
    `rows=${dRows.map((r) => r.channel).join(',')}`);
  check('e (Telegram): exactly one Telegram message', tgTo('e').length === 1, `messages=${tgTo('e').length}`);
  rows.push(['New collection', 'each person: app or Telegram', 'switch "New collections" off → in-app entry only', '1 message per person']);

  await notify.sendCollectionNotifications(db, col.id, id('a'), 'RE_NOTIFY', 1);
  await sleep(800);
  check('later wave (RE_NOTIFY) does not repeat for already notified people', tgTo('e').length === 1, `e=${tgTo('e').length}`);

  // --- 4. Responses: grouped, already seen ones not sent
  tgSent.length = 0;
  for (const p of ['b', 'c', 'd']) await call(id(p)).obligation.create({ collectionId: col.id, amount: 10 });
  const r1 = await notify.sendResponseDigest(db, col.id);
  const r2 = await notify.sendResponseDigest(db, col.id);
  const digest = tgTo('a');
  check('3 responses in the window → one message with count 3', r1 === 'sent' && digest.length === 1 && digest[0]!.text.includes('3'), `r1=${r1} msgs=${digest.length}`);
  check('the same window again → nothing', r2 === 'nothing', r2);
  await call(id('e')).obligation.create({ collectionId: col.id, amount: 10 });
  await call(id('a')).collection.getById({ id: col.id }); // the author opens the collection and sees it
  await sleep(300);
  const r3 = await notify.sendResponseDigest(db, col.id);
  check('response already seen by the author → nothing sent', r3 === 'nothing' && tgTo('a').length === 1, r3);
  rows.push(['Response to my collection', "author's channel", 'grouped in a 5-minute window; seen → not sent', '3 responses → 1 message']);

  // --- 5. Close: one message to notified people, digest stops
  tgSent.length = 0;
  await call(id('a')).collection.close({ id: col.id });
  await sleep(800);
  await notify.sendCollectionClosedTg(db, col.id, id('a'));
  const eClose = tgTo('e').length;
  const cClose = tgTo('c').length;
  const r4 = await notify.sendResponseDigest(db, col.id);
  check('collection closed → one message per notified person (also for c: it is their collection update)', eClose === 1 && cClose === 1, `e=${eClose} c=${cClose}`);
  check('after close no response message is sent', r4 === 'inactive', r4);
  rows.push(['Collection closed', 'each person: app or Telegram', 'repeat → nothing; responses digest stops', '1 message per person']);

  // --- 6. Connection request and answer via the real flow
  tgSent.length = 0;
  const { token } = await call(id('a')).invite.generate();
  await call(id('g')).invite.accept({ token });
  await call(id('g')).invite.accept({ token }); // repeat of the same request
  const pend = await db.pendingConnection.findFirst({ where: { fromUserId: id('g'), toUserId: id('a') }, select: { id: true } });
  await Promise.allSettled([
    call(id('a')).pending.accept({ pendingId: pend!.id }),
    call(id('a')).pending.accept({ pendingId: pend!.id }), // second device / bot button at the same time
  ]);
  await sleep(500);
  const links = await db.connection.count({ where: pair(id('a'), id('g')) });
  check('request: one message to the person asked, even when the link is opened twice', tgTo('a').length === 1, `a=${tgTo('a').length}`);
  check('answer: one message to the requester, one connection after two parallel accepts', tgTo('g').length === 1 && links === 1, `g=${tgTo('g').length} links=${links}`);
  rows.push(['Connection request', "addressee's channel (Telegram: accept/decline buttons)", 'no reminders for silence', '1 message; answer 1 message']);

  // --- 6b. Direct request: repeat after a decline, after a removed connection, and in parallel
  tgSent.length = 0;
  const errOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => `${e?.code}:${e?.message}`);
  await db.connection.deleteMany({ where: pair(id('d'), id('e')) });
  await db.pendingConnection.deleteMany({ where: { OR: [{ fromUserId: id('d') }, { toUserId: id('d') }] } });
  tgSent.length = 0;
  const race = await Promise.allSettled([
    call(id('d')).pending.sendDirectRequest({ targetUserId: id('e') }),
    call(id('d')).pending.sendDirectRequest({ targetUserId: id('e') }),
  ]);
  await sleep(300);
  const raceErr = race.find((r) => r.status === 'rejected') as PromiseRejectedResult | undefined;
  check('direct request ×2 in parallel → one message, the other gets a clear "already pending"',
    tgTo('e').length === 1 && (!raceErr || raceErr.reason?.code === 'CONFLICT'), `e=${tgTo('e').length} err=${raceErr?.reason?.code ?? 'none'}`);
  const dp = await db.pendingConnection.findFirst({ where: { fromUserId: id('d'), toUserId: id('e') }, select: { id: true } });
  await call(id('e')).pending.reject({ pendingId: dp!.id });
  tgSent.length = 0;
  const afterDecline = await errOf(call(id('d')).pending.sendDirectRequest({ targetUserId: id('e') }));
  await sleep(300);
  check('repeat after a decline → clear refusal, no message', afterDecline === 'CONFLICT:Request declined' && tgTo('e').length === 0,
    `${afterDecline} e=${tgTo('e').length}`);
  // Accepted earlier, connection removed later: a new request is a new event
  await db.pendingConnection.update({ where: { id: dp!.id }, data: { status: 'ACCEPTED' } });
  tgSent.length = 0;
  const afterRemoved = await errOf(call(id('d')).pending.sendDirectRequest({ targetUserId: id('e') }));
  await sleep(300);
  check('new request after a removed connection → accepted, one message', afterRemoved === null && tgTo('e').length === 1,
    `${afterRemoved ?? 'ok'} e=${tgTo('e').length}`);
  rows.push(['Direct request: repeat after decline', '—', 'declined → clear refusal, nothing sent', '0 messages']);

  // --- 7. Regular help (SO-1): reminder once per cycle, unsubscribe and switch respected
  tgSent.length = 0;
  const DAY = 24 * 60 * 60 * 1000;
  const reg = await db.collection.create({
    data: {
      creatorId: id('a'), type: 'REGULAR', amount: 100, chatLink: 'https://t.me/so45reg', status: 'ACTIVE',
      currentCycleStart: new Date(Date.now() - (REGULAR_CYCLE_DAYS - 3) * DAY - 12 * 60 * 60 * 1000), cycleNumber: 1,
    } as any,
  });
  await db.obligation.create({ data: { collectionId: reg.id, userId: id('e'), amount: 10, isSubscription: true } });
  await db.obligation.create({ data: { collectionId: reg.id, userId: id('b'), amount: 10, isSubscription: true, unsubscribedAt: new Date() } as any });
  await db.obligation.create({ data: { collectionId: reg.id, userId: id('c'), amount: 10, isSubscription: true } });
  await db.user.update({ where: { id: id('c') }, data: { notifyRenewalReminder: false } });
  await processCycleRenewalReminder({} as any);
  await processCycleRenewalReminder({} as any);
  await sleep(800);
  check('renewal reminder: once for the subscriber', tgTo('e').length === 1, `e=${tgTo('e').length}`);
  check('renewal reminder: nothing after unsubscribe or with the reminder switched off', tgTo('b').length === 0 && tgTo('c').length === 0 && (await deliveries('b', 'cycle:')).length === 0);
  rows.push(['Regular help: renewal reminder', "participant's channel", 'unsubscribe / switch off → nothing; 28-day cycle unchanged', '2 worker runs → 1 message']);

  // --- 8. Push texts: a reason to open the app, no names, amounts or contacts
  const src = readFileSync(new URL('../src/services/notification.service.ts', import.meta.url), 'utf8');
  const pushTexts = [...src.matchAll(/\{ title: (['`])([^'`]*)\1, body: (['`])([^'`]*)\3/g)].map((m) => ({ title: m[2]!, body: m[4]! }));
  const interpolated = pushTexts.filter((p) => p.title.includes('${') || p.body.includes('${'));
  check('push texts are fixed strings without names, amounts or contacts', pushTexts.length >= 11 && interpolated.length === 0, `texts=${pushTexts.length}`);
  for (const p of pushTexts) console.log(`    push: ${p.title} — ${p.body}`);
  rows.push(['Push text', 'app', 'no names, amounts, contacts', `${pushTexts.length} fixed texts`]);

  // --- 9. No push at all: the person still sees events and participates
  const dList = await call(id('d')).notification.list({} as any).then((r: any) => r, () => null);
  const dObl = await db.obligation.count({ where: { userId: id('d') } });
  check('without push the person sees events in the app and has participated', !!dList && dObl === 1);

  console.log('\n| Event | Channel | Suppression | Repeat |\n|---|---|---|---|');
  for (const r of rows) console.log(`| ${r.join(' | ')} |`);
}

try {
  await main();
} catch (e) {
  failed++;
  console.error(e);
} finally {
  await cleanup().catch((e) => console.error('cleanup failed', e));
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
}
