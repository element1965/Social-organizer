/**
 * Measurements on the synthetic network of scripts/seed-scale.ts: how long the handshake graph takes to
 * load and to keep up to date against a real database, how long walks take, and which hot queries read
 * a whole table. Prints numbers; it fails only when an update of the graph falls back to a full reload.
 *
 * Usage (from apps/api):
 *   DATABASE_URL=postgresql://postgres:<password>@localhost:5434/so_scale_check?schema=public JWT_SECRET=<16+ chars> npx tsx --expose-gc scripts/check-scale.ts
 */
import { getDb, Prisma } from '@so/db';

const url = process.env.DATABASE_URL || '';
const dbName = (url.match(/\/([^/?]+)(\?|$)/) ?? [])[1];
if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(url) || dbName !== 'so_scale_check') {
  console.error('Refusing to run: DATABASE_URL must be the local database so_scale_check.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { getGraph, graphStats, invalidateGraph } = await import('../src/services/graph-cache.service.js');
const { networkReach, clearReachCache } = await import('../src/services/network.service.js');
const { walkRings } = await import('../src/services/bfs.service.js');
const { planWave } = await import('../src/services/notify-routing.service.js');
const { findClusters } = await import('../src/services/cluster.service.js');
const { funnelReport } = await import('../src/services/funnel.service.js');
const { suggestAcquaintances } = await import('../src/services/suggestion.service.js');

const db = getDb();
const mb = () => Math.round(process.memoryUsage().heapUsed / 1048576);
const gc = () => (globalThis as { gc?: () => void }).gc?.();
const timed = async <T>(run: () => Promise<T>): Promise<[T, number]> => {
  const startedAt = performance.now();
  const value = await run();
  return [value, Math.round((performance.now() - startedAt) * 10) / 10];
};
const line = (name: string, value: string) => console.log(`${name.padEnd(70)} ${value}`);
let failed = 0;

try {
  const [{ people, connections }] = await db.$queryRaw<Array<{ people: number; connections: number }>>`
    SELECT (SELECT COUNT(*) FROM users)::int AS people, (SELECT COUNT(*) FROM connections)::int AS connections
  ` as [{ people: number; connections: number }];
  console.log(`Network: ${people} people, ${connections} connections\n`);
  const person = (i: number) => `c${String(i).padStart(24, '0')}`;
  const sample = [0.11, 0.37, 0.52, 0.76, 0.93].map((f) => person(Math.max(1, Math.floor(people * f))));

  /* ---------- The graph in memory ---------- */
  gc();
  const heapBefore = mb();
  const [graph, loadMs] = await timed(() => getGraph(db));
  gc();
  line('Full load of the graph from the database', `${loadMs} ms, heap +${mb() - heapBefore} MB`);

  const signatureTimes: number[] = [];
  for (let i = 0; i < 3; i++) {
    const [, ms] = await timed(() => db.$queryRaw`
      SELECT (SELECT COUNT(*) FROM connections)::bigint AS c, (SELECT MAX("createdAt") FROM connections) AS m,
             (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)::bigint AS d
    `);
    signatureTimes.push(ms);
  }
  line('Exact signature (after a change, once a minute)', `${signatureTimes.join(', ')} ms`);

  // Two people who are not connected yet
  const [a, b] = [sample[0]!, sample[4]!];
  const pair = a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a };
  await db.connection.deleteMany({ where: pair });
  invalidateGraph([a, b]);
  await getGraph(db);
  const loadsBefore = graphStats().fullLoads;

  // A connection made by another process: found by the signature, appended from the newest rows
  await db.connection.create({ data: pair });
  invalidateGraph();
  const [, appendMs] = await timed(() => getGraph(db));
  line('A connection added elsewhere (append)', `${appendMs} ms`);

  // The same connection removed in this process: only the two people are read again
  await db.connection.deleteMany({ where: pair });
  invalidateGraph([a, b]);
  const [afterRemoval, rereadMs] = await timed(() => getGraph(db));
  line('A connection removed (re-read of two people)', `${rereadMs} ms`);
  const reloaded = graphStats().fullLoads - loadsBefore;
  if (reloaded > 0 || afterRemoval.edgeCount !== (await db.connection.count())) failed++;
  line('Full reloads caused by these two changes', `${reloaded}${reloaded > 0 ? '  <-- expected 0' : ''}`);

  /* ---------- Walks ---------- */
  // After a change every read re-checks the table for 3 s; the walks are measured outside that window,
  // with the budgets already in memory, as a request in a running server finds them
  await new Promise((r) => setTimeout(r, 3200));
  clearReachCache();
  const reachTimes: number[] = [];
  let reachSample = await networkReach(db, sample[0]!);
  clearReachCache();

  // The walk alone, without the cache and the budgets around it
  const walkTimes: number[] = [];
  const g = await getGraph(db);
  for (const id of sample) {
    const root = g.find(id)!;
    const startedAt = performance.now();
    const reached = g.tally(root, 6, new Float32Array(0), 3).people;
    walkTimes.push(Math.round((performance.now() - startedAt) * 10) / 10);
    if (reached === 0) failed++;
  }
  line('Counting walk to the 6th handshake alone', `${walkTimes.join(', ')} ms`);
  const loose = graphStats();
  line('Graph: people, connections, outside the flat lists', `${loose.people}, ${loose.connections}, ${loose.overflow} added + ${loose.holes} removed`);
  line('Memory: heap, typed arrays', `${mb()} MB, ${Math.round(process.memoryUsage().arrayBuffers / 1048576)} MB`);
  for (const id of sample) {
    const [value, ms] = await timed(() => networkReach(db, id));
    reachTimes.push(ms);
    reachSample = value;
  }
  line('Reach to the 6th handshake, first request of a person', `${reachTimes.join(', ')} ms`);
  line('  people by handshake (last sample)', JSON.stringify(reachSample.byDepth));

  const waveTimes: number[] = [];
  let told = 0;
  for (const id of sample) {
    const [plan, ms] = await timed(async () => planWave(db, await walkRings(db, id), 300));
    waveTimes.push(ms);
    told = plan.external.length;
  }
  line('Choosing who a 300 $ Need notifies', `${waveTimes.join(', ')} ms (${told} people)`);

  const [suggested, suggestMs] = await timed(() => suggestAcquaintances(db, sample[2]!));
  line('"You may know each other"', `${suggestMs} ms (${suggested.length} people)`);
  const [clusters, clusterMs] = await timed(() => findClusters(db));
  line('Clusters for the admin statistics', `${clusterMs} ms (${clusters.list.length} clusters, largest ${clusters.list[0]?.members.length ?? 0})`);
  const [, funnelMs] = await timed(() => funnelReport(db));
  line('Admin funnel', `${funnelMs} ms`);

  /* ---------- Hot queries: time and whole-table reads ---------- */
  console.log('\nQuery'.padEnd(71) + ' time      reads a whole table');
  const neighbours = graph.neighbours(graph.find(sample[2]!)!).map((n) => graph.ids[n]!);
  const ring = graph.ids.slice(0, 500);
  const user = sample[2]!;
  const need = 'q' + '1'.padStart(24, '0');
  const since = new Date(Date.now() - 7 * 86_400_000);
  const queries: Array<[string, Prisma.Sql]> = [
    ['Feed of a person (notification.list)', Prisma.sql`
      SELECT * FROM notifications WHERE "userId" = ${user} AND status IN ('UNREAD', 'READ') ORDER BY "createdAt" DESC LIMIT 21`],
    ['Unread counter (every 30 s per open app)', Prisma.sql`
      SELECT COUNT(*) FROM notifications WHERE "userId" = ${user} AND status = 'UNREAD'`],
    ['Who was already told about a Need', Prisma.sql`
      SELECT DISTINCT "userId" FROM notifications WHERE "collectionId" = ${need}`],
    ['Recent requests of 500 people (wave rules)', Prisma.sql`
      SELECT "userId", COUNT(*) FROM notification_deliveries
      WHERE "userId" = ANY(${ring}) AND "eventKey" LIKE 'col:%:new' AND "createdAt" >= ${since} GROUP BY "userId"`],
    ['Requests waiting for a person (every 20 s)', Prisma.sql`
      SELECT * FROM pending_connections WHERE "toUserId" = ${user} AND status = 'PENDING' ORDER BY "createdAt" DESC`],
    ['Connections of a person', Prisma.sql`
      SELECT * FROM connections WHERE "userAId" = ${user} OR "userBId" = ${user}`],
    ['Connection counts of a person\'s acquaintances', Prisma.sql`
      SELECT u.id, COUNT(c.id) FROM users u
      LEFT JOIN connections c ON (c."userAId" = u.id OR c."userBId" = u.id)
      WHERE u.id = ANY(${neighbours}) GROUP BY u.id`],
    ['Graph signature, exact (after a change, once a minute)', Prisma.sql`
      SELECT (SELECT COUNT(*) FROM connections), (SELECT MAX("createdAt") FROM connections),
             (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)`],
    ['Newest connections (append)', Prisma.sql`
      SELECT "userAId", "userBId", "createdAt" FROM connections WHERE "createdAt" >= ${new Date(Date.now() - 60_000)}`],
    ['Graph signature, light (every 5 s)', Prisma.sql`
      SELECT (SELECT MAX("createdAt") FROM connections), (SELECT COUNT(*) FROM users WHERE "deletedAt" IS NOT NULL)`],
    ['Newest accounts (admin clusters look for people without connections)', Prisma.sql`
      SELECT id, name, "remainingBudget" FROM users WHERE "deletedAt" IS NULL ORDER BY "createdAt" DESC LIMIT 2000`],
    ['Budgets of everyone who set one (once a minute)', Prisma.sql`
      SELECT id, "remainingBudget" FROM users WHERE "remainingBudget" > 0 AND "deletedAt" IS NULL`],
  ];
  type PlanNode = { 'Node Type': string; 'Relation Name'?: string; Plans?: PlanNode[] };
  const wholeTables = (node: PlanNode, out: Set<string> = new Set()): Set<string> => {
    if (node['Node Type'] === 'Seq Scan' && node['Relation Name']) out.add(node['Relation Name']);
    for (const child of node.Plans ?? []) wholeTables(child, out);
    return out;
  };
  for (const [name, sql] of queries) {
    const rows = await db.$queryRaw<Array<{ 'QUERY PLAN': Array<{ Plan: PlanNode; 'Execution Time': number }> }>>(
      Prisma.sql`EXPLAIN (ANALYZE, FORMAT JSON) ${sql}`,
    );
    const plan = rows[0]!['QUERY PLAN'][0]!;
    const scans = [...wholeTables(plan.Plan)];
    console.log(`${name.padEnd(70)} ${`${plan['Execution Time'].toFixed(1)} ms`.padEnd(9)} ${scans.length ? scans.join(', ') : '—'}`);
  }
} finally {
  await db.$disconnect();
}

console.log(failed === 0 ? '\nDone.' : '\nA graph update fell back to a full reload.');
process.exit(failed === 0 ? 0 : 1);
