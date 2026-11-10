/**
 * Local check of repeat notification waves (re-notify worker) and the Author/Developer announcements
 * (special-notify worker, special creators at collection creation). Real worker functions, services and
 * tRPC procedures against a LOCAL database named so_signal_check_a. Time is faked by passing a later
 * "now" to the worker; nothing leaves the machine (no Telegram token, no Redis).
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/so_signal_check_a?schema=public JWT_SECRET=<16+ chars> npx tsx scripts/check-renotify.ts
 */
import { getDb } from '@so/db';
import { RE_NOTIFY_INTERVAL_HOURS } from '@so/shared';

const url = process.env.DATABASE_URL || '';
const dbName = (url.match(/\/([^/?]+)(\?|$)/) ?? [])[1];
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || dbName !== 'so_signal_check_a') {
  console.error('Refusing to run: DATABASE_URL must be the local database so_signal_check_a.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;
process.env.ADMIN_IDS = 'rn-admin';

const { appRouter } = await import('../src/routers/index.js');
const { sendCollectionNotifications } = await import('../src/services/notification.service.js');
const { invalidateGraph } = await import('../src/services/graph-cache.service.js');
const { runReNotify } = await import('../src/workers/re-notify.worker.js');
const { runSpecialNotify } = await import('../src/workers/special-notify.worker.js');

const db = getDb();
const P = 'rn-';
const id = (s: string) => `${P}${s}`;
const call = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const H = 60 * 60 * 1000;
const ahead = (hours: number) => new Date(Date.now() + hours * H);

let failed = 0;
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
  await db.ignoreEntry.deleteMany({ where: { OR: [{ fromUserId: { in: ids } }, { toUserId: { in: ids } }] } });
  await db.platformAccount.deleteMany({ where: { userId: { in: ids } } });
  await db.notificationDelivery.deleteMany({ where: { userId: { in: ids } } });
  await db.notifyStats.deleteMany({ where: { userId: { in: ids } } });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}

async function mkUsers(names: string[], extra: Record<string, any> = {}) {
  await db.user.createMany({ data: names.map((n) => ({ id: id(n), name: `User ${n}`, language: 'en', onboardingCompleted: true, ...extra }) as any) });
  // A linked Telegram account makes a person reachable outside the app (no token is set, nothing is sent)
  await db.platformAccount.createMany({ data: names.map((n) => ({ userId: id(n), platform: 'TELEGRAM' as const, platformId: `${P}tg-${n}` })) });
}
const link = (a: string, b: string) => db.connection.create({ data: pair(id(a), id(b)) });
const requestRows = (collectionId: string) =>
  db.notification.findMany({ where: { collectionId, type: { in: ['NEW_COLLECTION', 'RE_NOTIFY'] } }, select: { userId: true, type: true, wave: true } });
const names = (rows: Array<{ userId: string }>) => new Set(rows.map((r) => r.userId.slice(P.length)));
const same = (a: Set<string>, b: string[]) => a.size === b.length && b.every((x) => a.has(x));
const fmt = (s: Set<string>) => [...s].sort().join(',') || '-';

async function main() {
  await cleanup();

  // ---------- Graph ----------
  // a = author of an emergency collection (100 $). Ring 1: b1 b2 b3, m (new collections off), i (ignored by a),
  // j (ignores a), d (deleted). Ring 2: c1 (via b1), c2 (via b2).
  await mkUsers(['a', 'b1', 'b2', 'b3', 'c1', 'c2', 'i', 'j', 'd', 'n1']);
  await mkUsers(['m'], { notifyNewCollections: false });
  await db.user.update({ where: { id: id('d') }, data: { deletedAt: new Date() } });
  for (const x of ['b1', 'b2', 'b3', 'm', 'i', 'j', 'd']) await link('a', x);
  await link('b1', 'c1');
  await link('b2', 'c2');
  await db.ignoreEntry.create({ data: { fromUserId: id('a'), toUserId: id('i') } });
  await db.ignoreEntry.create({ data: { fromUserId: id('j'), toUserId: id('a') } });
  invalidateGraph();

  const emergency = await db.collection.create({
    data: { creatorId: id('a'), type: 'EMERGENCY', amount: 100, chatLink: 'https://t.me/rncheck' },
  });
  // First wave: a small budget, so only one person hears about it at creation
  await sendCollectionNotifications(db, emergency.id, id('a'), 'NEW_COLLECTION', 1, 1);
  await sleep(500);
  const w1 = names(await requestRows(emergency.id));
  check('creation wave reached exactly one person', w1.size === 1 && [...w1].every((x) => x.startsWith('b')), fmt(w1));

  // ---------- Gate ----------
  await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS - 1));
  check(`no wave before ${RE_NOTIFY_INTERVAL_HOURS}h`, names(await requestRows(emergency.id)).size === 1);

  // ---------- Wave after 12h ----------
  const res2 = await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS + 1));
  await sleep(500);
  const rows2 = await requestRows(emergency.id);
  const wave2 = rows2.filter((r) => r.type === 'RE_NOTIFY');
  const expected = ['b1', 'b2', 'b3', 'm', 'c1', 'c2'].filter((x) => !w1.has(x));
  check('wave after the interval reached only new people, further along the graph', same(names(wave2), expected), `got=${fmt(names(wave2))} want=${expected.sort().join(',')}`);
  check('first-wave person was not notified again', !names(wave2).has([...w1][0]!));
  check('excluded: author, ignored by author, ignoring author, deleted', !['a', 'i', 'j', 'd'].some((x) => names(rows2).has(x)));
  check('wave number follows the previous ones (first RE_NOTIFY = wave 1)', wave2.every((r) => r.wave === 1), `waves=${[...new Set(wave2.map((r) => r.wave))]}`);
  check('worker reports the number reached', res2.get(emergency.id) === wave2.length, `reported=${res2.get(emergency.id)}`);
  const mDelivery = await db.notificationDelivery.count({ where: { userId: id('m'), eventKey: { startsWith: 'col:' } } });
  const bDelivery = await db.notificationDelivery.count({ where: { userId: id('b2'), eventKey: `col:${emergency.id}:new` } });
  check('external message goes through the event key (one per person); muted person gets none', bDelivery <= 1 && mDelivery === 0, `b2=${bDelivery} m=${mDelivery}`);

  // ---------- Nobody new: no rows, and the collection rests ----------
  const res3 = await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS + 1));
  const markers = await db.notificationDelivery.count({ where: { userId: id('a'), eventKey: { startsWith: `renotify:${emergency.id}:` } } });
  check('a wave with nobody new creates no entries and leaves a rest marker', res3.get(emergency.id) === 0 && markers === 1 && (await requestRows(emergency.id)).length === rows2.length, `markers=${markers}`);

  // A new person appears; the marker holds the collection back until the interval passes
  await link('c1', 'n1');
  invalidateGraph();
  await runReNotify(db, ahead(5));
  check('after an empty check the collection is not re-scanned within the interval', !names(await requestRows(emergency.id)).has('n1'));
  await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS + 1));
  await sleep(300);
  const after = await requestRows(emergency.id);
  check('next interval: only the newcomer is reached', names(after).has('n1') && after.length === rows2.length + 1, `rows ${rows2.length} → ${after.length}`);
  const perUser = new Map<string, number>();
  for (const r of after) perUser.set(r.userId, (perUser.get(r.userId) ?? 0) + 1);
  check('nobody got two request entries for the collection', [...perUser.values()].every((n) => n === 1));

  // ---------- Collections that must not get waves ----------
  const mkCollection = async (who: string, data: Record<string, any>) => {
    await mkUsers([who, `${who}-friend`]);
    await link(who, `${who}-friend`);
    invalidateGraph();
    return db.collection.create({ data: { creatorId: id(who), type: 'EMERGENCY', amount: 50, chatLink: 'https://t.me/rncheck', ...data } });
  };
  const regular = await mkCollection('reg', { type: 'REGULAR', currentCycleStart: new Date() });
  const paused = await mkCollection('pau', { status: 'BLOCKED', blockedAt: new Date(), blockReason: 'COMMUNITY' });
  const closed = await mkCollection('clo', { status: 'CLOSED', closedAt: new Date() });
  const noAmount = await mkCollection('noa', { amount: null });
  const goal = await mkCollection('goa', {});
  await db.obligation.create({ data: { collectionId: goal.id, userId: id('goa-friend'), amount: 50 } });
  const control = await mkCollection('ctl', {});
  await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS + 1));
  await sleep(300);
  for (const [label, c] of [['regular', regular], ['paused / under review', paused], ['closed', closed], ['no amount', noAmount], ['goal already reached', goal]] as const) {
    check(`${label} collection gets no wave`, (await requestRows(c.id)).length === 0);
  }
  check('control: an active emergency collection with a shortfall does get one', names(await requestRows(control.id)).has('ctl-friend'));
  await db.collection.update({ where: { id: paused.id }, data: { status: 'ACTIVE', blockedAt: null, blockReason: null } });
  await runReNotify(db, ahead(RE_NOTIFY_INTERVAL_HOURS + 1));
  check('control: the paused one gets a wave once resumed', names(await requestRows(paused.id)).has('pau-friend'));

  // ---------- Special creators ----------
  await mkUsers(['S', 's1', 's2'], {});
  await db.user.update({ where: { id: id('S') }, data: { role: 'AUTHOR' } });
  await link('S', 's1');
  await link('S', 's2');
  await mkUsers(['admin', 'ad1']);
  await link('admin', 'ad1');
  invalidateGraph();
  const sCol = await call(id('S')).collection.create({ type: 'EMERGENCY', amount: 20, chatLink: 'https://t.me/rncheck' });
  await sleep(500);
  check('Author collection with an amount is announced through the network at creation', same(names(await requestRows(sCol.id)), ['s1', 's2']), fmt(names(await requestRows(sCol.id))));
  const sNoAmount = await call(id('S')).collection.create({ type: 'REGULAR', chatLink: 'https://t.me/rncheck' });
  await sleep(300);
  check('Author collection without an amount gets no network announcement', (await requestRows(sNoAmount.id)).length === 0);
  const adminCol = await call(id('admin')).collection.create({ type: 'EMERGENCY', amount: 20, chatLink: 'https://t.me/rncheck' });
  await sleep(500);
  check('admin collection with an amount is announced at creation', names(await requestRows(adminCol.id)).has('ad1'));

  // ---------- special-notify ----------
  // h: helped someone, not connected to S. Others must be skipped for their own reasons.
  await mkUsers(['h', 'hMuted', 'hIgnored', 'hDeleted', 'hPledged']);
  await db.user.update({ where: { id: id('hMuted') }, data: { notifyNewCollections: false } });
  await db.user.update({ where: { id: id('hDeleted') }, data: { deletedAt: new Date() } });
  await db.ignoreEntry.create({ data: { fromUserId: id('S'), toUserId: id('hIgnored') } });
  const someone = control.id; // any collection of someone else
  for (const x of ['h', 'hMuted', 'hIgnored', 'hDeleted', 'hPledged', 's1', 'S']) {
    await db.obligation.create({ data: { collectionId: someone, userId: id(x), amount: 1 } });
  }
  await db.obligation.create({ data: { collectionId: sCol.id, userId: id('hPledged'), amount: 1 } });
  const told1 = await runSpecialNotify(db);
  const special = () => db.notification.findMany({ where: { collectionId: sCol.id, type: { in: ['SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER'] } }, select: { userId: true } });
  check('special-notify tells only the past helper (goa-friend also helped; not author, muted, ignored, deleted, pledged, already notified)', same(names(await special()), ['h', 'goa-friend']), `${fmt(names(await special()))} (created ${told1})`);
  const told2 = await runSpecialNotify(db);
  check('a second run tells nobody twice', told2 === 0 && (await special()).length === 2, `created ${told2}`);

  console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
}

try {
  await main();
} catch (err) {
  console.error(err);
  failed++;
} finally {
  await cleanup().catch((e) => console.error('cleanup failed', e));
  await db.$disconnect();
}
process.exit(failed === 0 ? 0 : 1);
