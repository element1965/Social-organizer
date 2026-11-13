/**
 * Local check of the load fixes: the in-memory graph appended instead of reloaded, the per-person
 * reach cache, batched wave inserts and uploaded photos served from their own table.
 * Real services and tRPC procedures against a LOCAL database; nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/<local db>?schema=public JWT_SECRET=<16+ chars> npx tsx scripts/check-load-fixes.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "lf-").
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;
// Names given to invalidateGraph are kept for 30 s in production; here 2 s, so the check can also
// reach the quiet state in which only the light signature runs
process.env.GRAPH_PENDING_TTL_MS = '2000';
// A kept reach is served as it is for a minute in production; here for 1.5 s
process.env.REACH_STALE_MS = '1500';

const { appRouter } = await import('../src/routers/index.js');
const { getGraph, graphStats, graphVersion, invalidateGraph } = await import('../src/services/graph-cache.service.js');
const { networkReach, clearReachCache } = await import('../src/services/network.service.js');
const { findRecipientsViaBfs, walkRings } = await import('../src/services/bfs.service.js');
const { planWave } = await import('../src/services/notify-routing.service.js');
const { createConnectionWithinLimit } = await import('../src/services/connection-request.service.js');
const { sendCollectionNotifications } = await import('../src/services/notification.service.js');
const { backfillAvatars, readAvatar } = await import('../src/services/avatar.service.js');

const db = getDb();
const P = 'lf-';
const id = (s: string | number) => `${P}${s}`;
const call = (userId: string) => appRouter.createCaller({ db, userId, ip: '127.0.0.1' } as any);
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function cleanup() {
  await db.user.deleteMany({ where: { id: { startsWith: P } } });
  invalidateGraph();
}

/** How the graph was brought up to date so far: full loads of the table against the cheaper updates. */
const fullLoads = () => graphStats().fullLoads;
const updates = () => graphStats().appends + graphStats().refreshes;
type G = Awaited<ReturnType<typeof getGraph>>;
const linked = (g: G, a: string, b: string) => {
  const [x, y] = [g.find(id(a)), g.find(id(b))];
  return x !== undefined && y !== undefined && g.hasEdge(x, y) && g.hasEdge(y, x);
};
const degreeOf = (g: G, a: string) => {
  const n = g.find(id(a));
  return n === undefined ? 0 : g.degree(n);
};

try {
  await cleanup();

  // A chain root → 1 → 2 → … → 8 and a fan of 30 people around person 1
  const people = ['root', ...Array.from({ length: 8 }, (_, i) => i + 1), ...Array.from({ length: 30 }, (_, i) => `f${i}`)];
  await db.user.createMany({
    data: people.map((p) => ({ id: id(p), name: `LF ${p}`, monthlyBudget: 5, remainingBudget: 5 })),
  });
  const edges: Array<[string, string]> = [['root', '1']];
  for (let i = 1; i < 8; i++) edges.push([String(i), String(i + 1)]);
  for (let i = 0; i < 30; i++) edges.push(['1', `f${i}`]);
  await db.connection.createMany({ data: edges.map(([a, b]) => pair(id(a), id(b))) });
  invalidateGraph();
  // An invalidation without ids keeps every number fresh (uncached) for 3 seconds: wait it out
  await sleep(3100);

  /* ---------- Reach: numbers, depth limit, cache ---------- */
  const r1 = await networkReach(db, id('root'));
  // Rings from root: 1 → {1}, 2 → {2, f0..f29}, 3 → {3}, 4 → {4}, 5 → {5}, 6 → {6}; 7 and 8 are beyond
  check('reach counts people up to the 6th handshake', r1.exact === 36, `exact=${r1.exact}`);
  check('visible rings 1–3 are counted exactly', r1.visible === 33, `visible=${r1.visible}`);
  check('sum of remaining budgets over the reach', r1.canHelp === 36 * 5, `canHelp=${r1.canHelp}`);

  const reads = { full: fullLoads(), updates: updates() };
  const r2 = await networkReach(db, id('root'));
  check('a second request is answered from the kept value (same object)', r2 === r1);
  check('…without reading connections again', fullLoads() === reads.full && updates() === reads.updates);

  /* ---------- A new connection: appended, visible at once for the two people ---------- */
  await db.user.create({ data: { id: id('new'), name: 'LF new', monthlyBudget: 7, remainingBudget: 7 } });
  const versionBefore = graphVersion();
  const fullBefore = fullLoads();
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('root'), id('new')));
  const r3 = await networkReach(db, id('root'));
  check('own new connection is in the numbers on the next request', r3.exact === 37 && r3.canHelp === 36 * 5 + 7, `exact=${r3.exact} canHelp=${r3.canHelp}`);
  check('the graph was appended, not reloaded', fullLoads() === fullBefore && graphVersion() > versionBefore, `full reads +${fullLoads() - fullBefore}`);
  const rNew = await networkReach(db, id('new'));
  check('the newcomer sees the network through the new connection', rNew.exact === 1 + 1 + 31 + 1 + 1 + 1, `exact=${rNew.exact}`);

  // A person further away keeps their number for up to a minute, then catches up
  const far1 = await networkReach(db, id('3'));
  await db.user.create({ data: { id: id('new2'), name: 'LF new2' } });
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('new'), id('new2')));
  const far2 = await networkReach(db, id('3'));
  check('someone far from the change is served the kept value within the minute', far2 === far1);
  clearReachCache();
  const far3 = await networkReach(db, id('3'));
  check('…and the fresh walk sees the new people', far3.exact === far1.exact + 1, `${far1.exact} → ${far3.exact}`);

  /* ---------- After the kept value goes stale: visible rings again, far rings as measured before ---------- */
  // Seen from 6: 5, 4 and 3 are visible (with 7 and 8 on the other side); 2, 1 and then root with the fan are far.
  // A newcomer next to 5 is at the 2nd handshake; a newcomer next to 1 is at the 6th.
  clearReachCache();
  const before6 = await networkReach(db, id('6'));
  await db.user.createMany({ data: [{ id: id('near'), name: 'LF near', remainingBudget: 3 }, { id: id('far'), name: 'LF far', remainingBudget: 4 }] });
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('5'), id('near')));
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('1'), id('far')));
  // Any request brings the graph up to date; here nobody else is asking, so the check does
  await getGraph(db);
  check('a kept value is served as it is while fresh', (await networkReach(db, id('6'))) === before6);
  await sleep(1600);
  const stale6 = await networkReach(db, id('6'));
  check('once stale, a newcomer in the visible rings is counted at once',
    stale6.visible === before6.visible + 1 && stale6.canHelpVisible === before6.canHelpVisible + 3,
    `visible ${before6.visible} → ${stale6.visible}`);
  check('…while the far rings stay as measured (they are shown rounded and refreshed hourly)',
    stale6.exact === before6.exact + 1 && stale6.canHelp === before6.canHelp + 3, `exact ${before6.exact} → ${stale6.exact}`);
  clearReachCache();
  const fresh6 = await networkReach(db, id('6'));
  check('a full walk then counts the far newcomer too', fresh6.exact === before6.exact + 2 && fresh6.canHelp === before6.canHelp + 7,
    `exact ${fresh6.exact}, canHelp ${fresh6.canHelp}`);
  // Back to the network the next checks expect
  await call(id('5')).connection.revoke({ targetUserId: id('near') });
  await call(id('1')).connection.revoke({ targetUserId: id('far') });
  await db.user.deleteMany({ where: { id: { in: [id('near'), id('far')] } } });

  /* ---------- A removed connection: only the two people are read again ---------- */
  const fullBeforeDelete = fullLoads();
  await call(id('root')).connection.revoke({ targetUserId: id('new') });
  const r4 = await networkReach(db, id('root'));
  check('a removed connection leaves the numbers at once', r4.exact === 36, `exact=${r4.exact}`);
  check('…without reading the whole table again', fullLoads() === fullBeforeDelete, `full reads +${fullLoads() - fullBeforeDelete}`);
  const graph = await getGraph(db);
  const rows = await db.connection.count();
  check('graph edge count equals the table', graph.edgeCount === rows, `${graph.edgeCount} vs ${rows}`);
  check('the removed pair is gone from both sides',
    !linked(graph, 'root', 'new') && degreeOf(graph, 'new') === 1);

  /* ---------- A deleted account: its connections leave the graph, again without a full reload ---------- */
  await db.user.create({ data: { id: id('gone'), name: 'LF gone' } });
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('gone'), id('root')));
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('gone'), id('8')));
  const withGone = await networkReach(db, id('root'));
  // root now reaches "gone" directly and, through it, 8 and 7
  check('a new acquaintance opens the way to people behind them', withGone.exact === 36 + 3, `exact=${withGone.exact}`);
  const fullBeforeAccount = fullLoads();
  await call(id('gone')).user.delete();
  const afterGone = await networkReach(db, id('root'));
  const g3 = await getGraph(db);
  check('a deleted account leaves the numbers of its acquaintances at once', afterGone.exact === 36, `exact=${afterGone.exact}`);
  check('…its connections are gone from the graph on both sides',
    degreeOf(g3, 'gone') === 0 && !linked(g3, 'root', 'gone') && !linked(g3, '8', 'gone'));
  check('…the graph still equals the table', g3.edgeCount === (await db.connection.count()));
  check('…and the whole table was not read again', fullLoads() === fullBeforeAccount, `full reads +${fullLoads() - fullBeforeAccount}`);

  /* ---------- Rows committed with an older time than the newest loaded one ---------- */
  await db.connection.create({ data: { ...pair(id('f0'), id('f1')), createdAt: new Date(Date.now() - 30_000) } });
  await db.connection.create({ data: { ...pair(id('f2'), id('f3')), createdAt: new Date(Date.now() - 3_600_000) } });
  invalidateGraph();
  const g2 = await getGraph(db);
  check('late rows are found (window) or the graph reloads (count check)', g2.edgeCount === (await db.connection.count()));
  check('both late connections are in the graph',
    linked(g2, 'f0', 'f1') && linked(g2, 'f2', 'f3'));

  /* ---------- A connection made by another process, with no invalidation here ---------- */
  // The periodic check looks only at the newest connection and the deleted accounts; that is enough to see it
  const fullBeforeForeign = fullLoads();
  await new Promise((r) => setTimeout(r, 3100)); // past the window in which every read is exact
  await getGraph(db);
  await new Promise((r) => setTimeout(r, 5100));
  const lightBefore = graphStats().lightChecks;
  await getGraph(db);
  check('a quiet periodic check is answered without counting all connections', graphStats().lightChecks === lightBefore + 1,
    `light checks +${graphStats().lightChecks - lightBefore}`);
  await db.connection.create({ data: pair(id('f4'), id('f5')) });
  await new Promise((r) => setTimeout(r, 5100)); // the next periodic check is due
  const g4 = await getGraph(db);
  check('a connection made elsewhere shows at the next periodic check',
    linked(g4, 'f4', 'f5') && g4.edgeCount === (await db.connection.count()));
  check('…appended, not reloaded', fullLoads() === fullBeforeForeign, `full reads +${fullLoads() - fullBeforeForeign}`);

  /* ---------- Walk with paths built on demand ---------- */
  const walk = await findRecipientsViaBfs(db, id('root'), 6, Infinity, [id('2')]);
  const six = walk.find((w) => w.userId === id('6'));
  check('path runs from the author to the person through the people between',
    JSON.stringify(six?.path) === JSON.stringify(['root', '1', '2', '3', '4', '5', '6'].map(id)), JSON.stringify(six?.path));
  check('an excluded person is passed through but not a recipient', !walk.some((w) => w.userId === id('2')) && !!six);
  check('nobody beyond the 6th handshake', !walk.some((w) => w.userId === id('7')));

  /* ---------- The same walk ring by ring, asked for only as far as the wave needs ---------- */
  const ringList = [...(await walkRings(db, id('root'), 6, [id('2')]))];
  check('rings hold the same people in the same order as the full walk',
    JSON.stringify(ringList.flat().map((w) => w.userId)) === JSON.stringify(walk.map((w) => w.userId)));
  check('each ring is one handshake, nearest first',
    ringList.every((ring, i) => ring.every((w) => w.depth === ring[0]!.depth) && (i === 0 || ring[0]!.depth > ringList[i - 1]![0]!.depth)));
  const sixInRing = ringList.flat().find((w) => w.userId === id('6'));
  check('a ring entry carries the handshake path', JSON.stringify(sixInRing?.path) === JSON.stringify(six?.path));

  // People 1 and the fan can be reached outside the app, so a budget of 3 is spent in the 2nd ring
  const reachablePeople = ['1', ...Array.from({ length: 30 }, (_, i) => `f${i}`)];
  await db.platformAccount.createMany({
    data: reachablePeople.map((p) => ({ userId: id(p), platform: 'TELEGRAM' as const, platformId: `${P}tg-${p}` })),
  });
  let ringsAsked = 0;
  const lazyRings = await walkRings(db, id('root'));
  const counted: Iterable<Awaited<ReturnType<typeof findRecipientsViaBfs>>> = {
    [Symbol.iterator]: () => ({
      next: () => {
        const step = lazyRings.next();
        if (!step.done) ringsAsked++;
        return step as IteratorResult<Awaited<ReturnType<typeof findRecipientsViaBfs>>>;
      },
    }),
  };
  const lazyPlan = await planWave(db, counted, 3);
  check('a wave of 3 takes the 1st ring and the start of the 2nd',
    lazyPlan.external.length === 3 && lazyPlan.external[0]?.userId === id('1') && lazyPlan.external.slice(1).every((w) => w.depth === 2),
    `external=${lazyPlan.external.map((w) => w.userId).join(',')}`);
  check('…and never asks for the rings behind them', ringsAsked === 2, `rings asked=${ringsAsked}`);

  /* ---------- A ring read in small chunks gives the same wave as the ring read at once ---------- */
  // Only 1 and f0..f9 can be reached outside the app now: the 2nd ring has 10 such people among 31
  await db.platformAccount.deleteMany({
    where: { platformId: { in: Array.from({ length: 20 }, (_, i) => `${P}tg-f${i + 10}`) } },
  });
  const planIds = async (budget: number, chunk?: number) => {
    const plan = await planWave(db, await walkRings(db, id('root')), budget, chunk);
    return JSON.stringify([plan.external.map((w) => w.userId), plan.inApp.map((w) => w.userId)]);
  };
  // 5: the budget ends inside the ring. 11: it ends exactly on the last person who can be reached.
  // 100: the whole network is covered.
  for (const budget of [5, 11, 100]) {
    const [whole, small, one] = [await planIds(budget, 10_000), await planIds(budget, 2), await planIds(budget, 1)];
    check(`budget ${budget}: chunks of 2 and of 1 plan the same wave as the whole ring`, whole === small && whole === one,
      whole === small ? '' : `${whole} vs ${small}`);
  }
  const exact = JSON.parse(await planIds(11, 2)) as [string[], string[]];
  check('a ring whose reachable people all got the message gives the others the in-app entry',
    exact[0].length === 11 && exact[1].length > 0 && exact[1].includes(id('2')), `external=${exact[0].length} inApp=${exact[1].length}`);
  const partial = JSON.parse(await planIds(5, 2)) as [string[], string[]];
  check('a ring the budget ends in gives no in-app entries yet', partial[0].length === 5 && partial[1].length === 0);
  await db.platformAccount.deleteMany({ where: { platformId: { startsWith: `${P}tg-` } } });

  /* ---------- Clusters are admin statistics only ---------- */
  let clusterRefused = false;
  try { await call(id('root')).cluster.list(); } catch (e: any) { clusterRefused = e?.code === 'FORBIDDEN'; }
  check('cluster.list refuses a person who is not an admin', clusterRefused);

  /* ---------- Wave stored in batches ---------- */
  const col = await db.collection.create({
    data: { creatorId: id('root'), type: 'EMERGENCY', amount: 20, currency: 'USD', chatLink: 'https://t.me/lf_check' },
  });
  const created = await sendCollectionNotifications(db, col.id, id('root'), 'NEW_COLLECTION', 1, 20);
  const stored = await db.notification.findMany({ where: { collectionId: col.id }, select: { userId: true, handshakePath: true } });
  check('a wave stores one entry per person', stored.length === created && created > 0, `created=${created} rows=${stored.length}`);
  const first = stored.find((n) => n.userId === id('1'));
  check('entries keep the handshake path', JSON.stringify(first?.handshakePath) === JSON.stringify([id('root'), id('1')]));
  const again = await sendCollectionNotifications(db, col.id, id('root'), 'RE_NOTIFY', 1, 20);
  const total = await db.notification.count({ where: { collectionId: col.id } });
  check('the next wave reaches only people not told yet', total === stored.length + again, `+${again}`);
  const perUser = await db.notification.groupBy({ by: ['userId'], where: { collectionId: col.id }, _count: true });
  check('nobody has two entries for the Need', perUser.every((p) => p._count === 1));

  /* ---------- Uploaded photos ---------- */
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
  const updated = await call(id('root')).user.update({ photoUrl: dataUrl });
  check('an uploaded photo becomes a short address', /^\/api\/avatar\/lf-root\/[a-f0-9]{32}$/.test(updated.photoUrl ?? ''), updated.photoUrl ?? '');
  const hash = (updated.photoUrl ?? '').split('/').pop()!;
  const pic = await readAvatar(db, id('root'), hash);
  check('the address returns the same bytes', !!pic && pic.mime === 'image/jpeg' && pic.data.equals(jpeg));
  check('a wrong hash returns nothing', (await readAvatar(db, id('root'), 'a'.repeat(32))) === null);
  const slice = await call(id('1')).connection.graphSlice();
  const rootNode = slice.nodes.find((n) => n.id === id('root'));
  check('lists of people carry the address, not the picture', rootNode?.photoUrl === updated.photoUrl);

  let rejected = false;
  try { await call(id('root')).user.update({ photoUrl: 'data:text/html;base64,PGI+' }); } catch { rejected = true; }
  check('a data URL that is not a picture is refused', rejected);

  // Old rows: data URL straight in users.photoUrl
  await db.user.update({ where: { id: id('1') }, data: { photoUrl: dataUrl } });
  await db.user.update({ where: { id: id('2') }, data: { photoUrl: 'data:image/svg+xml;base64,PHN2Zy8+' } });
  const moved = await backfillAvatars(db);
  const one = await db.user.findUnique({ where: { id: id('1') }, select: { photoUrl: true } });
  const two = await db.user.findUnique({ where: { id: id('2') }, select: { photoUrl: true } });
  check('backfill moves old data-URL photos', moved >= 1 && (one?.photoUrl ?? '').startsWith('/api/avatar/lf-1/'), `moved=${moved}`);
  check('…and leaves what it cannot serve untouched', (two?.photoUrl ?? '').startsWith('data:image/svg'));

  await db.user.update({ where: { id: id('root') }, data: { photoUrl: 'https://example.org/p.jpg' } });
  check('an address stops working once the person changed the photo', (await readAvatar(db, id('root'), hash)) === null);
} finally {
  await cleanup();
  await db.$disconnect();
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
