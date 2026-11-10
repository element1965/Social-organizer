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

const { appRouter } = await import('../src/routers/index.js');
const { getGraph, graphVersion, invalidateGraph } = await import('../src/services/graph-cache.service.js');
const { networkReach, clearReachCache } = await import('../src/services/network.service.js');
const { findRecipientsViaBfs } = await import('../src/services/bfs.service.js');
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

/** Counts full reads of the connections table (a reload) against appends (a ranged read). */
let fullReads = 0;
let rangedReads = 0;
const realFindMany = db.connection.findMany.bind(db.connection);
(db.connection as any).findMany = (args: any) => {
  if (args?.where?.createdAt) rangedReads++;
  else if (!args?.where) fullReads++;
  return realFindMany(args);
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

  const reads = { full: fullReads, ranged: rangedReads };
  const r2 = await networkReach(db, id('root'));
  check('a second request is answered from the kept value (same object)', r2 === r1);
  check('…without reading connections again', fullReads === reads.full && rangedReads === reads.ranged);

  /* ---------- A new connection: appended, visible at once for the two people ---------- */
  await db.user.create({ data: { id: id('new'), name: 'LF new', monthlyBudget: 7, remainingBudget: 7 } });
  const versionBefore = graphVersion();
  const fullBefore = fullReads;
  await db.$transaction((tx) => createConnectionWithinLimit(tx, id('root'), id('new')));
  const r3 = await networkReach(db, id('root'));
  check('own new connection is in the numbers on the next request', r3.exact === 37 && r3.canHelp === 36 * 5 + 7, `exact=${r3.exact} canHelp=${r3.canHelp}`);
  check('the graph was appended, not reloaded', fullReads === fullBefore && graphVersion() > versionBefore, `full reads +${fullReads - fullBefore}`);
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

  /* ---------- A removed connection: full reload, numbers go down ---------- */
  const fullBeforeDelete = fullReads;
  await call(id('root')).connection.revoke({ targetUserId: id('new') });
  const r4 = await networkReach(db, id('root'));
  check('a removed connection leaves the numbers at once', r4.exact === 36, `exact=${r4.exact}`);
  check('…through a full reload of the graph', fullReads > fullBeforeDelete);
  const graph = await getGraph(db);
  const rows = await db.connection.count();
  check('graph edge count equals the table', graph.edgeCount === rows, `${graph.edgeCount} vs ${rows}`);

  /* ---------- Rows committed with an older time than the newest loaded one ---------- */
  await db.connection.create({ data: { ...pair(id('f0'), id('f1')), createdAt: new Date(Date.now() - 30_000) } });
  await db.connection.create({ data: { ...pair(id('f2'), id('f3')), createdAt: new Date(Date.now() - 3_600_000) } });
  invalidateGraph();
  const g2 = await getGraph(db);
  check('late rows are found (window) or the graph reloads (count check)', g2.edgeCount === (await db.connection.count()));
  check('both late connections are in the graph',
    !!g2.adj.get(id('f0'))?.some((e) => e.neighbor === id('f1')) && !!g2.adj.get(id('f2'))?.some((e) => e.neighbor === id('f3')));

  /* ---------- Walk with paths built on demand ---------- */
  const walk = await findRecipientsViaBfs(db, id('root'), 6, Infinity, [id('2')]);
  const six = walk.find((w) => w.userId === id('6'));
  check('path runs from the author to the person through the people between',
    JSON.stringify(six?.path) === JSON.stringify(['root', '1', '2', '3', '4', '5', '6'].map(id)), JSON.stringify(six?.path));
  check('an excluded person is passed through but not a recipient', !walk.some((w) => w.userId === id('2')) && !!six);
  check('nobody beyond the 6th handshake', !walk.some((w) => w.userId === id('7')));

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
