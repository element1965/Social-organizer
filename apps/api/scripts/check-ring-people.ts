/**
 * Local check of connection.ringPeople: the People lists of the 1st–3rd handshake, page by page, complete
 * however large a ring is, ordered and searched on the server.
 * Real tRPC procedures against a LOCAL database; nothing leaves the machine.
 *
 * Usage (from apps/api):
 *   JWT_SECRET=<16+ chars> npx tsx --env-file=.env scripts/check-ring-people.ts
 *
 * Never point DATABASE_URL at production: the script creates and deletes test rows (ids start with "rp-").
 */
import { getDb } from '@so/db';

if (!/@(localhost|127\.0\.0\.1)(:\d+)?\//.test(process.env.DATABASE_URL || '')) {
  console.error('Refusing to run: DATABASE_URL is not a local database.');
  process.exit(1);
}
delete process.env.TELEGRAM_BOT_TOKEN;
delete process.env.REDIS_URL;

const { appRouter } = await import('../src/routers/index.js');
const { invalidateGraph } = await import('../src/services/graph-cache.service.js');

const db = getDb();
const P = 'rp-';
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

type Sort = 'recent' | 'name' | 'intention' | 'brought';
type Row = Awaited<ReturnType<ReturnType<typeof call>['connection']['ringPeople']>>['people'][number];

/** Every page of a ring, in order, with the totals each page reported. */
async function allPages(ring: 1 | 2 | 3, sort: Sort, limit: number, search?: string) {
  const me = call(id('me'));
  const rows: Row[] = [];
  const totals: number[] = [];
  let cursor: number | null | undefined = undefined;
  let pages = 0;
  do {
    const page = await me.connection.ringPeople({ ring, sort, limit, search, cursor });
    rows.push(...page.people);
    totals.push(page.total);
    cursor = page.nextCursor;
    pages++;
  } while (cursor != null && pages < 100);
  return { rows, totals, pages };
}

const sameSet = (a: string[], b: string[]) => a.length === b.length && new Set(a).size === a.length && a.every((x) => new Set(b).has(x));

try {
  await cleanup();
  /*
   * me ── a ── x0…x129 (130 people: more than one page) ── z0…z9 (ring 3, z_i through x_i) ── far (ring 4)
   *    └─ b ── y0…y4                                       └─ ring 2 also: gone2 (deleted) ── behind
   *    └─ gone1 (deleted, direct)
   */
  const xs = Array.from({ length: 130 }, (_, i) => `x${i}`);
  const ys = Array.from({ length: 5 }, (_, i) => `y${i}`);
  const zs = Array.from({ length: 10 }, (_, i) => `z${i}`);
  const people = ['me', 'a', 'b', 'gone1', 'gone2', 'behind', 'far', ...xs, ...ys, ...zs];
  // Names in an order unrelated to the ids; budgets in steps so "intention" has ties broken by name
  const nameOf = (p: string, i: number) => `RP ${String.fromCharCode(97 + ((i * 7) % 26))}${String.fromCharCode(97 + ((i * 11) % 26))} ${p}`;
  await db.user.createMany({
    data: people.map((p, i) => ({
      id: id(p),
      name: p === 'x7' ? 'RP Zelda Needle' : p === 'y2' ? 'RP needle_y' : p === 'z3' ? 'RP NEEDLE z' : nameOf(p, i),
      remainingBudget: i % 4 === 0 ? null : (i % 5) * 10,
      deletedAt: p.startsWith('gone') ? new Date() : null,
    })),
  });
  const base = Date.now() - 50 * 24 * 60 * 60 * 1000;
  let k = 0;
  const edges: Array<[string, string]> = [
    ['me', 'a'], ['me', 'b'], ['me', 'gone1'],
    ...xs.map((x) => ['a', x] as [string, string]),
    ...ys.map((y) => ['b', y] as [string, string]),
    ...zs.map((z, i) => [xs[i]!, z] as [string, string]),
    ['z0', 'far'], ['a', 'gone2'], ['gone2', 'behind'],
    // Two ring-2 people know each other: connection counts in the ring differ
    ['y0', 'y1'],
  ];
  await db.connection.createMany({
    data: edges.map(([u, v]) => ({ ...pair(id(u), id(v)), createdAt: new Date(base + (k++ * 97 % 1000) * 60_000) })),
  });
  invalidateGraph();

  const me = call(id('me'));

  /* ---------- Paging over a ring larger than one page ---------- */
  const ring2Ids = [...xs, ...ys].map(id);
  for (const sort of ['recent', 'name', 'intention'] as const) {
    const { rows, totals, pages } = await allPages(2, sort, 40);
    const ids = rows.map((r) => r.id);
    check(`ring 2, "${sort}": ${pages} pages of 40 cover the ring once, with no overlap`,
      pages === 4 && sameSet(ids, ring2Ids), `${ids.length} rows, ${new Set(ids).size} distinct`);
    check(`ring 2, "${sort}": every page reports the ring's total`, totals.every((t) => t === ring2Ids.length), totals.join());
  }

  // Orders
  const recent = (await allPages(2, 'recent', 100)).rows;
  check('"recent": the newest connection on the path first',
    recent.every((r, i) => i === 0 || (recent[i - 1]!.connectedAt?.getTime() ?? 0) >= (r.connectedAt?.getTime() ?? 0)));
  const byName = (await allPages(2, 'name', 100)).rows;
  check('"name": alphabetical, case-insensitive',
    byName.every((r, i) => i === 0 || byName[i - 1]!.name.toLowerCase() <= r.name.toLowerCase()));
  const byIntention = (await allPages(2, 'intention', 100)).rows;
  check('"intention": the largest intention first, then by name',
    byIntention.every((r, i) => {
      if (i === 0) return true;
      const prev = byIntention[i - 1]!;
      const pa = prev.remainingBudget ?? 0;
      const ra = r.remainingBudget ?? 0;
      return pa > ra || (pa === ra && prev.name.toLowerCase() <= r.name.toLowerCase());
    }));
  const brought = (await allPages(1, 'brought', 100)).rows;
  check('"brought" on the 1st ring: who connected the most people first',
    brought.map((r) => r.id).join() === [id('a'), id('b')].join() && brought[0]!.connectionCount === 132,
    brought.map((r) => `${r.id}:${r.connectionCount}`).join());
  const broughtFar = (await allPages(2, 'brought', 100)).rows;
  check('"brought" beyond the 1st ring falls back to "recent"',
    broughtFar.map((r) => r.id).join() === recent.map((r) => r.id).join());

  /* ---------- Rings, paths, privacy ---------- */
  const ring1 = (await allPages(1, 'recent', 100)).rows;
  check('ring 1 lists the direct connections, never a deleted account',
    sameSet(ring1.map((r) => r.id), [id('a'), id('b')]), ring1.map((r) => r.id).join());
  check('ring 1 has no path', ring1.every((r) => r.via.length === 0));
  const ring3 = await allPages(3, 'name', 3);
  check('ring 3 is complete and paged (10 people, pages of 3)',
    ring3.pages === 4 && sameSet(ring3.rows.map((r) => r.id), zs.map(id)) && ring3.totals.every((t) => t === 10));
  const z5 = ring3.rows.find((r) => r.id === id('z5'));
  check('ring 3 carries the path through the 1st and 2nd ring', z5?.via.map((v) => v.id).join() === [id('a'), id('x5')].join(),
    JSON.stringify(z5?.via));
  const x3 = byName.find((r) => r.id === id('x3'));
  check('ring 2 carries the path through the 1st ring with names', x3?.via.length === 1 && x3.via[0]!.id === id('a') && x3.via[0]!.name.length > 0);
  check('x-people show how many connections they have', byName.find((r) => r.id === id('x0'))?.connectionCount === 2);

  const everyone = new Set<string>();
  for (const ring of [1, 2, 3] as const) for (const sort of ['recent', 'name'] as const) for (const r of (await allPages(ring, sort, 100)).rows) everyone.add(r.id);
  check('a person beyond the 3rd ring is never returned', !everyone.has(id('far')));
  check('deleted accounts are never listed', !everyone.has(id('gone1')) && !everyone.has(id('gone2')));
  check('…and never a way through (nobody behind them is reached)', !everyone.has(id('behind')));
  check('the viewer is not in their own lists', !everyone.has(id('me')));
  let rejected = false;
  try {
    await me.connection.ringPeople({ ring: 4 as 3, sort: 'recent', limit: 10 });
  } catch {
    rejected = true;
  }
  check('a 4th ring cannot be asked for', rejected);
  rejected = false;
  try {
    await me.connection.ringPeople({ ring: 2, sort: 'recent', limit: 101 });
  } catch {
    rejected = true;
  }
  check('a page is at most 100 people', rejected);

  /* ---------- Search across the whole ring ---------- */
  for (const sort of ['recent', 'name', 'intention'] as const) {
    const found = await allPages(2, sort, 1, 'needle');
    check(`search in ring 2 ("${sort}") finds matches anywhere in the ring, any case`,
      sameSet(found.rows.map((r) => r.id), [id('x7'), id('y2')]) && found.totals.every((t) => t === 2),
      found.rows.map((r) => r.name).join(' | '));
  }
  const inRing3 = await allPages(3, 'recent', 50, 'NeEdLe');
  // By name (z3) and by the acquaintance they are reached through (x7 and y2 are named "…needle…")
  const viaNeedle = ring3.rows.filter((r) => r.via.some((v) => v.id === id('x7') || v.id === id('y2'))).map((r) => r.id);
  const expectedRing3 = [...new Set([id('z3'), ...viaNeedle])];
  check('search in ring 3, by name and by the acquaintance on the path',
    sameSet(inRing3.rows.map((r) => r.id), expectedRing3) && inRing3.totals[0] === expectedRing3.length,
    `${inRing3.rows.map((r) => r.id).join()} vs ${expectedRing3.join()}`);

  // A search finds people by who they are reached through
  await db.user.update({ where: { id: id('x5') }, data: { name: 'Pathfinder Quill' } });
  for (const sort of ['recent', 'name'] as const) {
    const throughX5 = await allPages(3, sort, 2, 'pathFINDER');
    const expected = ring3.rows.filter((r) => r.via.some((v) => v.id === id('x5'))).map((r) => r.id);
    check(`search in ring 3 ("${sort}") finds people reached through a matching acquaintance`,
      expected.length > 0 && sameSet(throughX5.rows.map((r) => r.id), expected) && throughX5.totals.every((t) => t === expected.length),
      `${throughX5.rows.map((r) => r.id).join()} vs ${expected.join()}`);
  }
  const x5self = await allPages(2, 'name', 50, 'pathfinder');
  check('…and in ring 2 the acquaintance itself', x5self.rows.map((r) => r.id).join() === id('x5'), x5self.rows.map((r) => r.id).join());
  const literal = await allPages(2, 'name', 50, 'needle_');
  check('"_" and "%" in a search are plain characters', literal.rows.map((r) => r.id).join() === id('y2'), literal.rows.map((r) => r.name).join());
  const none = await me.connection.ringPeople({ ring: 2, sort: 'name', limit: 50, search: 'no-such-person' });
  check('a search without matches: empty, total 0', none.people.length === 0 && none.total === 0 && none.nextCursor === null);
  const past = await me.connection.ringPeople({ ring: 2, sort: 'name', limit: 50, cursor: 1000 });
  check('a page past the end: empty, the total still right', past.people.length === 0 && past.total === ring2Ids.length && past.nextCursor === null);

  /* ---------- Someone without connections sees the network of the person they asked ---------- */
  await db.user.create({ data: { id: id('new'), name: 'RP new' } });
  await db.pendingConnection.create({ data: { fromUserId: id('new'), toUserId: id('me'), status: 'PENDING' } });
  const newcomer = await call(id('new')).connection.ringPeople({ ring: 1, sort: 'name', limit: 10 });
  check('a newcomer with only a pending request sees nobody listed (a request is not an acquaintance)',
    newcomer.people.length === 0 && newcomer.total === 0);
  const newcomerStats = await call(id('new')).connection.getNetworkStats();
  check('…and the network numbers of that person come without names',
    Object.keys(newcomerStats.usersByDepth).length === 0 && (newcomerStats.byDepth[1] ?? 0) > 0, JSON.stringify(newcomerStats.byDepth));
} finally {
  await cleanup();
  await db.$disconnect();
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
