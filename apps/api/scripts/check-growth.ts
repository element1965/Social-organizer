/**
 * Local check of the growth measurement: the source kept with a request and a connection on every path,
 * the invite-open counter, "You may know each other" and the admin funnel.
 * Real services and tRPC procedures against a LOCAL database; nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/<local db>?schema=public JWT_SECRET=<16+ chars> npx tsx scripts/check-growth.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "gr-").
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;
process.env.ADMIN_IDS = 'gr-admin';

const { appRouter } = await import('../src/routers/index.js');
const { invalidateGraph, getGraph } = await import('../src/services/graph-cache.service.js');
const { FUNNEL_WEEKS } = await import('../src/services/funnel.service.js');

const db = getDb();
const P = 'gr-';
const id = (s: string | number) => `${P}${s}`;
const call = (userId: string | null) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  await db.user.deleteMany({ where: { id: { startsWith: P } } });
  invalidateGraph();
}

const sourceOf = async (a: string, b: string) =>
  (await db.connection.findUnique({ where: { userAId_userBId: pair(id(a), id(b)) }, select: { source: true } }))?.source;
const requestSource = async (from: string, to: string) =>
  (await db.pendingConnection.findUnique({
    where: { fromUserId_toUserId: { fromUserId: id(from), toUserId: id(to) } },
    select: { source: true },
  }))?.source;
const opens = async (source: string) =>
  Number((await db.$queryRaw<Array<{ n: number }>>`
    SELECT COALESCE(SUM(count), 0)::int AS n FROM invite_open_days WHERE day = CURRENT_DATE AND source = ${source}
  `)[0]?.n ?? 0);

try {
  await cleanup();
  const people = ['admin', 'host', 'l1', 'l2', 'q1', 'n1', 'd1', 'me', 'a', 'b', 'c', 'x', 'y', 'z', 'w', 'ig', 'gone', 's1'];
  // The admin exists before the first report, so every later difference is made by the people below
  await db.user.create({ data: { id: id('admin'), name: 'GR admin' } });
  const before = await call(id('admin')).stats.adminFunnel();
  await db.user.createMany({ data: people.slice(1).map((p) => ({ id: id(p), name: `GR ${p}` })) });

  /* ---------- Source on every path ---------- */
  // Personal link (the token is the inviter's id), plain and shared with ?src=wa
  await call(id('l1')).invite.accept({ token: id('host'), viaLink: true });
  await call(id('l2')).invite.accept({ token: id('host'), viaLink: true, src: 'wa' });
  check('a request through the personal link is marked "link"', (await requestSource('l1', 'host')) === 'link');
  check('…and "link_wa" when the address carried ?src=wa', (await requestSource('l2', 'host')) === 'link_wa');
  const incoming = await call(id('host')).pending.incoming();
  for (const row of incoming) await call(id('host')).pending.accept({ pendingId: row.id });
  check('the confirmed connection keeps the source of its request',
    (await sourceOf('l1', 'host')) === 'link' && (await sourceOf('l2', 'host')) === 'link_wa',
    `${await sourceOf('l1', 'host')}, ${await sourceOf('l2', 'host')}`);

  // Live QR: connected at once
  const live = await call(id('host')).invite.generate({ ttl: 60 });
  await call(id('q1')).invite.accept({ token: live.token });
  check('a live QR connection is marked "qr"', (await sourceOf('q1', 'host')) === 'qr', String(await sourceOf('q1', 'host')));

  // A public Need page
  const col = await db.collection.create({
    data: { creatorId: id('host'), type: 'EMERGENCY', amount: 20, currency: 'USD', chatLink: 'https://t.me/gr_check' },
  });
  await call(id('n1')).invite.acceptSos({ collectionId: col.id });
  check('a connection from a Need page is marked "need"', (await sourceOf('n1', 'host')) === 'need');

  // A direct request from a person's page
  await call(id('d1')).pending.sendDirectRequest({ targetUserId: id('host') });
  check('a request from a person page is marked "direct"', (await requestSource('d1', 'host')) === 'direct');

  /* ---------- Invite opens ---------- */
  const [o1, o2] = [await opens('link'), await opens('link_tg')];
  await call(null).invite.opened();
  await call(null).invite.opened({ src: 'tg' });
  check('an opened invite page is counted for its source', (await opens('link')) === o1 + 1 && (await opens('link_tg')) === o2 + 1);

  /* ---------- "You may know each other" ---------- */
  // me knows a, b, c and w. x is known by a and b (offered); y only by a (not enough);
  // z by a and b but a request already exists; ig by a and b but ignored; gone by a and b but deleted.
  const edges: Array<[string, string]> = [
    ['me', 'a'], ['me', 'b'], ['me', 'c'], ['me', 'w'],
    ['a', 'x'], ['b', 'x'], ['a', 'y'],
    ['a', 'z'], ['b', 'z'], ['a', 'ig'], ['b', 'ig'], ['a', 'gone'], ['b', 'gone'],
    ['a', 'w'], ['b', 'w'],
    ['a', 's1'], ['b', 's1'], ['c', 's1'],
  ];
  await db.connection.createMany({ data: edges.map(([a, b]) => pair(id(a), id(b))) });
  await db.pendingConnection.create({ data: { fromUserId: id('z'), toUserId: id('me'), status: 'REJECTED', resolvedAt: new Date() } });
  await db.ignoreEntry.create({ data: { fromUserId: id('me'), toUserId: id('ig') } });
  await db.user.update({ where: { id: id('gone') }, data: { deletedAt: new Date() } });
  // Rows written straight to the table, as another process would: a read right after the invalidation re-checks it
  invalidateGraph();
  await getGraph(db);

  const list = await call(id('me')).connection.suggestions();
  const names = list.map((s) => s.id.slice(P.length)).join(',');
  check('people with two or more shared acquaintances are offered, most shared first', names === 's1,x', names);
  check('the count and the shared acquaintances come with each person',
    list[0]?.mutualCount === 3 && list[1]?.mutualCount === 2 && list[1]?.via.map((v) => v.id).sort().join() === [id('a'), id('b')].join(),
    JSON.stringify(list.map((s) => [s.mutualCount, s.via.length])));
  check('not offered: one shared acquaintance, an earlier request, an ignore entry, a deleted account, a direct connection',
    !list.some((s) => ['y', 'z', 'ig', 'gone', 'w', 'a'].includes(s.id.slice(P.length))));

  await call(id('me')).pending.sendDirectRequest({ targetUserId: id('x'), source: 'suggest' });
  check('a request from the suggestion is marked "suggest"', (await requestSource('me', 'x')) === 'suggest');
  const after = await call(id('me')).connection.suggestions();
  check('…and the person leaves the list', after.map((s) => s.id).join() === id('s1'), after.map((s) => s.id).join());
  check('someone with no connections gets no suggestions', (await call(id('admin')).connection.suggestions()).length === 0);

  /* ---------- Admin funnel ---------- */
  let refused = false;
  try { await call(id('me')).stats.adminFunnel(); } catch (e: any) { refused = e?.code === 'FORBIDDEN'; }
  check('the funnel refuses a person who is not an admin', refused);

  const report = await call(id('admin')).stats.adminFunnel();
  const week = report.weeks[report.weeks.length - 1]!;
  const weekBefore = before.weeks[before.weeks.length - 1]!;
  check(`the report covers ${FUNNEL_WEEKS} weeks, oldest first`,
    report.weeks.length === FUNNEL_WEEKS && report.weeks.every((w, i) => i === 0 || w.weekStart > report.weeks[i - 1]!.weekStart));
  // Added after the first report: everyone except the admin; one of them is deleted and not counted
  const added = people.length - 2;
  check('this week counts the new accounts', week.signedUp - weekBefore.signedUp === added, `+${week.signedUp - weekBefore.signedUp}`);
  check('…those who sent a request or have a connection', week.requested - weekBefore.requested === added,
    `+${week.requested - weekBefore.requested}`);
  // d1 only has a request that is still waiting
  check('…and those with a confirmed connection', week.connected - weekBefore.connected === added - 1,
    `+${week.connected - weekBefore.connected}`);
  check('steps never grow along the funnel',
    report.weeks.every((w) => w.signedUp >= w.requested && w.requested >= w.connected && w.connected >= w.five));
  check('opened invite pages are in this week', week.opened - weekBefore.opened === 2, `+${week.opened - weekBefore.opened}`);

  const delta = (source: string, field: 'connections' | 'requests' | 'opened') =>
    (report.sources.find((s) => s.source === source)?.[field] ?? 0) - (before.sources.find((s) => s.source === source)?.[field] ?? 0);
  check('connections are counted by source',
    delta('link', 'connections') === 1 && delta('link_wa', 'connections') === 1 && delta('qr', 'connections') === 1 && delta('need', 'connections') === 1,
    report.sources.map((s) => `${s.source}:${s.connections}`).join(' '));
  check('requests are counted by source', delta('direct', 'requests') === 1 && delta('suggest', 'requests') === 1);
  check('the ratio "newcomers with a connection per active person" is reported for 7 and 28 days',
    report.ratios.map((r) => r.days).join() === '7,28' && report.ratios.every((r) => r.newcomersConnected >= added - 1));
} finally {
  await db.$executeRaw`
    UPDATE invite_open_days SET count = GREATEST(count - 1, 0) WHERE day = CURRENT_DATE AND source IN ('link', 'link_tg')
  `.catch(() => {});
  await cleanup();
  await db.$disconnect();
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
