/**
 * Check of the graph kept as numbers (services/graph-store.ts) against a plain reference made of maps:
 * thousands of random connections, removed people and compactions, then the two are compared edge by
 * edge and walk by walk. Then the network figure (services/network-figure.ts): its depth, the one rounded
 * far count, and the reuse of kept far rings. No database, nothing leaves the machine.
 *
 * Usage (from apps/api):  npx tsx scripts/check-graph-store.ts
 */
import { GraphBuilder, HandshakeGraph } from '../src/services/graph-store.js';
import { measureFull, measureNear, NETWORK_MAX_DEPTH, ReachKeeper, stillReusable, type FarSnapshot } from '../src/services/network-figure.js';

/** A one-connection graph for checks that only need a graph object */
function build0(): HandshakeGraph {
  const gb = new GraphBuilder();
  gb.add('z0', 'z1', 1);
  return gb.finish();
}

let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
}

let seed = 12345;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const pick = (n: number) => Math.floor(random() * n);
const userId = (i: number) => `u${i}`;

/** The reference: person → neighbour → time, and who is deleted. */
class Reference {
  adj = new Map<string, Map<string, number>>();
  deleted = new Set<string>();
  add(a: string, b: string, at: number): boolean {
    if (a === b || this.adj.get(a)?.has(b)) return false;
    if (!this.adj.has(a)) this.adj.set(a, new Map());
    if (!this.adj.has(b)) this.adj.set(b, new Map());
    this.adj.get(a)!.set(b, at);
    this.adj.get(b)!.set(a, at);
    return true;
  }
  remove(a: string): void {
    for (const b of this.adj.get(a)?.keys() ?? []) this.adj.get(b)!.delete(a);
    this.adj.delete(a);
  }
  edges(): number {
    let n = 0;
    for (const m of this.adj.values()) n += m.size;
    return n / 2;
  }
  people(): number {
    let n = 0;
    for (const m of this.adj.values()) if (m.size > 0) n++;
    return n;
  }
  /** person → [depth, newest connection time on the way], breadth-first with a fixed neighbour order */
  walk(root: string, maxDepth: number, throughDeleted: boolean): Map<string, number> {
    const depth = new Map<string, number>([[root, 0]]);
    let frontier = [root];
    for (let d = 1; d <= maxDepth && frontier.length; d++) {
      const next: string[] = [];
      for (const from of frontier) {
        for (const to of this.adj.get(from)?.keys() ?? []) {
          if (depth.has(to) || (!throughDeleted && this.deleted.has(to))) continue;
          depth.set(to, d);
          next.push(to);
        }
      }
      frontier = next;
    }
    depth.delete(root);
    return depth;
  }
}

function compare(g: HandshakeGraph, ref: Reference, label: string) {
  let edgesOk = g.edgeCount === ref.edges();
  let peopleOk = g.peopleCount === ref.people();
  let listsOk = true;
  let hasOk = true;
  for (let n = 0; n < g.size; n++) {
    const mine = g.neighbours(n).map((m) => g.ids[m]!).sort();
    const theirs = [...(ref.adj.get(g.ids[n]!)?.keys() ?? [])].sort();
    if (mine.join() !== theirs.join() || g.degree(n) !== theirs.length) listsOk = false;
    g.eachNeighbour(n, (m, at) => {
      if (ref.adj.get(g.ids[n]!)?.get(g.ids[m]!) !== at) listsOk = false;
      if (!g.hasEdge(n, m) || !g.hasEdge(m, n)) hasOk = false;
    });
  }
  // Pairs that are not connected
  for (let i = 0; i < 300; i++) {
    const [a, b] = [pick(g.size), pick(g.size)];
    if (g.hasEdge(a, b) !== !!ref.adj.get(g.ids[a]!)?.has(g.ids[b]!)) hasOk = false;
  }
  let deletedOk = g.deletedCount === ref.deleted.size;
  for (let n = 0; n < g.size; n++) if (g.isDeleted(n) !== ref.deleted.has(g.ids[n]!)) deletedOk = false;

  let walksOk = true;
  let ringsOk = true;
  let pathsOk = true;
  for (let i = 0; i < 25; i++) {
    const root = pick(g.size);
    const maxDepth = 1 + pick(6);
    for (const through of [false, true]) {
      const expected = ref.walk(g.ids[root]!, maxDepth, through);
      const got = new Map<string, number>();
      let lastDepth = 0;
      let ordered = true;
      const reached = g.walk(root, maxDepth, (n, depth) => {
        if (depth < lastDepth) ordered = false;
        lastDepth = depth;
        got.set(g.ids[n]!, depth);
      }, through);
      if (!ordered || reached !== expected.size || got.size !== expected.size) walksOk = false;
      for (const [id, depth] of expected) if (got.get(id) !== depth) walksOk = false;
      // A path of the last walk is a real chain of connections of the right length
      for (const [id, depth] of [...got].slice(0, 5)) {
        const path = g.pathOfLastWalk(g.find(id)!);
        if (path.length !== depth + 1 || path[0] !== root) pathsOk = false;
        for (let k = 1; k < path.length; k++) if (!g.hasEdge(path[k - 1]!, path[k]!)) pathsOk = false;
      }
    }
    // The ring-by-ring walk reaches the same people at the same depths
    const expected = ref.walk(g.ids[root]!, maxDepth, false);
    const viaRings = new Map<string, number>();
    for (const ring of g.rings(root, maxDepth)) {
      for (const n of ring.people) {
        viaRings.set(g.ids[n]!, ring.depth);
        if (ring.depth > 1 && !g.hasEdge(n, ring.parent[n]!)) ringsOk = false;
      }
    }
    if (viaRings.size !== expected.size) ringsOk = false;
    for (const [id, depth] of expected) if (viaRings.get(id) !== depth) ringsOk = false;
  }
  // The counting walk agrees with the ordinary one: people by depth and the sums of a weight per person
  let tallyOk = true;
  const weights = new Float32Array(g.size);
  for (let n = 0; n < g.size; n++) weights[n] = n % 7;
  for (let i = 0; i < 25; i++) {
    const root = pick(g.size);
    const maxDepth = 1 + pick(6);
    const byDepth = new Array<number>(maxDepth + 1).fill(0);
    let weight = 0;
    let nearWeight = 0;
    const people = g.walk(root, maxDepth, (n, depth) => {
      byDepth[depth]!++;
      weight += weights[n]!;
      if (depth <= 3) nearWeight += weights[n]!;
    });
    const t = g.tally(root, maxDepth, weights, 3);
    if (t.people !== people || t.weight !== weight || t.nearWeight !== nearWeight || t.byDepth.join() !== byDepth.join()) tallyOk = false;
  }
  // A walk that is told to stop reaches exactly that many people
  let stopOk = true;
  for (let i = 0; i < 10; i++) {
    const root = pick(g.size);
    const all = g.walk(root, 6, () => undefined);
    const cap = 1 + pick(40);
    let seen = 0;
    g.walk(root, 6, () => ++seen < cap);
    if (seen !== Math.min(cap, all)) stopOk = false;
  }

  check(`${label}: connections and people counted`, edgesOk && peopleOk, `${g.edgeCount} vs ${ref.edges()}, ${g.peopleCount} vs ${ref.people()}`);
  check(`${label}: every person has the same neighbours and times`, listsOk);
  check(`${label}: hasEdge agrees both ways and for unconnected pairs`, hasOk);
  check(`${label}: deleted accounts`, deletedOk);
  check(`${label}: walks reach the same people at the same depth, nearest first`, walksOk);
  check(`${label}: paths of a walk are chains of real connections`, pathsOk);
  check(`${label}: ring-by-ring walks agree`, ringsOk);
  check(`${label}: the counting walk gives the same people and sums`, tallyOk);
  check(`${label}: a stopped walk stops exactly there`, stopOk);
}

/* ---------- Bulk load ---------- */
const PEOPLE = 3000;
const ref = new Reference();
const builder = new GraphBuilder();
for (let i = 1; i < PEOPLE; i++) {
  for (let k = 0; k < 4; k++) {
    const j = Math.max(0, i - 1 - pick(Math.min(i, 60)));
    if (ref.add(userId(i), userId(j), 1000 + i * 10 + k)) builder.add(userId(i), userId(j), 1000 + i * 10 + k);
  }
  if (random() < 0.7) {
    const j = pick(i);
    if (ref.add(userId(i), userId(j), 500 + i)) builder.add(userId(i), userId(j), 500 + i);
  }
}
const g = builder.finish();
check('bulk load leaves nothing outside the flat lists', g.looseness().overflow === 0 && g.looseness().holes === 0);
compare(g, ref, 'after bulk load');

/* ---------- Random changes ---------- */
let added = 0;
let removed = 0;
for (let step = 0; step < 6000; step++) {
  const r = random();
  if (r < 0.55) {
    // A new connection, sometimes with a person the graph has never seen
    const a = userId(pick(PEOPLE + 400));
    const b = userId(pick(PEOPLE + 400));
    const at = 50_000 + step;
    const expected = ref.add(a, b, at);
    const got = a !== b && g.addEdge(g.person(a), g.person(b), at);
    if (expected !== got) failed++;
    if (got) added++;
  } else if (r < 0.75) {
    const a = userId(pick(PEOPLE + 400));
    const n = g.find(a);
    ref.remove(a);
    if (n !== undefined) g.removePerson(n);
    removed++;
  } else if (r < 0.9) {
    const a = userId(pick(PEOPLE + 400));
    const flag = random() < 0.6;
    if (flag) ref.deleted.add(a);
    else ref.deleted.delete(a);
    g.setDeleted(g.person(a), flag);
  } else if (r < 0.905) {
    g.compact();
  }
  if (step === 2500) compare(g, ref, 'mid-way, with overflow and holes');
}
console.log(`(${added} connections added, ${removed} people removed)`);
compare(g, ref, 'after random changes');
check('overflow and holes are tracked', g.looseness().overflow >= 0 && g.looseness().holes >= 0, JSON.stringify(g.looseness()));
g.compact();
check('compaction empties overflow and holes', g.looseness().overflow === 0 && g.looseness().holes === 0);
compare(g, ref, 'after compaction');

/* ---------- The network figure: to the 6th handshake, one far count, far rings reused only when safe ---------- */
{
  // A chain root → a → b → c → d → e → f → x (x is at the 7th handshake), and 40 people around e (so at the 6th)
  const build = () => {
    const fb = new GraphBuilder();
    const chain = ['root', 'a', 'b', 'c', 'd', 'e', 'f', 'x'];
    for (let i = 1; i < chain.length; i++) fb.add(`n-${chain[i - 1]}`, `n-${chain[i]}`, i);
    for (let i = 0; i < 40; i++) fb.add('n-e', `n-fan${i}`, 100 + i);
    return fb.finish();
  };
  const budgetsOf = (graph: HandshakeGraph) => new Float32Array(graph.size + 16).fill(1);
  const node = (graph: HandshakeGraph, name: string) => graph.person(`n-${name}`);

  const fig = build();
  const first = measureFull(fig, fig.find('n-root'), budgetsOf(fig));
  // Rings: 1 {a}, 2 {b}, 3 {c}, 4 {d}, 5 {e}, 6 {f, 40 people}; x at the 7th is outside
  check('the figure counts everyone up to the 6th handshake and nobody further',
    NETWORK_MAX_DEPTH === 6 && first.value.exact === 46 && first.value.canHelp === 46 && !first.value.byDepth[7],
    JSON.stringify(first.value));
  check('rings 4–6 are one rounded count, and the headline is the visible rings plus exactly that count',
    first.value.visible === 3 && first.value.far.count === 40 && first.value.people === 3 + first.value.far.count,
    JSON.stringify(first.value.far));
  const small = measureFull(fig, fig.find('n-d'), budgetsOf(fig));
  check('"a few" far people add nothing to the headline (it never shows more than the far chip)',
    small.value.far.few && small.value.people === small.value.visible, JSON.stringify(small.value));

  // Someone new joins the 2nd ring: nobody can have crossed between the parts, the far part is reused
  fig.addEdge(node(fig, 'a'), node(fig, 'newcomer'), 1000);
  const reused = measureNear(fig, fig.find('n-root'), budgetsOf(fig), first.far);
  check('a brand-new person in the visible rings keeps the far part (no full walk) and is counted once',
    reused !== null && reused.visible === 4 && reused.exact === 47 && reused.canHelp === 47, JSON.stringify(reused));

  // A new connection pulls the far rings close: d (4th) becomes a 1st-ring person, e the 2nd, f and the 40 people the 3rd
  fig.addEdge(node(fig, 'root'), node(fig, 'd'), 1001);
  const crossed = measureNear(fig, fig.find('n-root'), budgetsOf(fig), first.far);
  const full = measureFull(fig, fig.find('n-root'), budgetsOf(fig));
  // Rings now: 1 {a, d}, 2 {b, newcomer, c, e}, 3 {f, 40 people}, 4 {x}
  check('people who crossed from the far rings into rings 1–3 refuse the kept far part (else counted twice)',
    crossed === null, JSON.stringify(crossed));
  check('…and the full walk counts each of them once',
    full.value.exact === 48 && full.value.visible === 47 && full.value.canHelp === 48, JSON.stringify(full.value));

  // Someone leaves the visible rings (an account deleted): the kept far part is refused as well
  fig.setDeleted(node(fig, 'b'), true);
  check('a person who left rings 1–3 refuses the kept far part (they could have gone to the far rings)',
    measureNear(fig, fig.find('n-root'), budgetsOf(fig), full.far) === null);
  // Another graph object (a full reload renumbers people): never reuse
  const reloaded = build();
  check('a reloaded graph never reuses a far part measured on the old one',
    measureNear(reloaded, reloaded.find('n-root'), budgetsOf(reloaded), first.far) === null);

  // An equal-size swap: c (3rd ring) leaves, a far person who was already in the graph (fan0, 6th ring) comes in
  // at the 3rd. Rings 1–3 hold as many old people as before, but not the same ones: the kept far part counted fan0
  const swap = build();
  const swapFirst = measureFull(swap, swap.find('n-root'), budgetsOf(swap));
  swap.setDeleted(node(swap, 'c'), true);
  swap.addEdge(node(swap, 'b'), node(swap, 'fan0'), 2000);
  const swapFull = measureFull(swap, swap.find('n-root'), budgetsOf(swap));
  check('an equal-size swap between rings 1–3 and the far rings refuses the kept far part',
    swapFirst.far.near!.length === 3 && swapFull.value.visible === 3 &&
      measureNear(swap, swap.find('n-root'), budgetsOf(swap), swapFirst.far) === null,
    JSON.stringify(swapFull.value.byDepth));
  // Now: a, b, fan0, then e, then d, f and the other 39, then x at the 6th: 46 people, each once
  check('…and the full walk counts the swapped person once', swapFull.value.exact === 46, JSON.stringify(swapFull.value));
  // The pair the earlier count-and-hash print could not tell apart: people numbered 57 and 718 leave rings 1–3,
  // people numbered 126 and 649 come in, nobody else moves. Numbers are given in the order people appear.
  const q = new GraphBuilder().finish();
  for (let i = 0; i < 800; i++) q.person(`q${i}`);
  const qn = (i: number) => q.find(`q${i}`)!;
  check('the swap test uses the person numbers it means', qn(57) === 57 && qn(718) === 718 && qn(126) === 126 && qn(649) === 649);
  for (const n of [57, 718, 10, 126, 649]) q.addEdge(qn(0), qn(n), 1);
  q.addEdge(qn(10), qn(11), 1);
  q.setDeleted(qn(126), true);
  q.setDeleted(qn(649), true);
  const qFirst = measureFull(q, qn(0), budgetsOf(q)); // rings 1–3: 57, 718, 10, 11
  q.setDeleted(qn(57), true);
  q.setDeleted(qn(718), true);
  q.setDeleted(qn(126), false);
  q.setDeleted(qn(649), false);
  const qNow = measureFull(q, qn(0), budgetsOf(q)); // rings 1–3: 126, 649, 10, 11
  check('the colliding equal-size swap {57, 718} → {126, 649} is told apart and refuses the kept far part',
    qFirst.far.near!.length === 4 && qNow.far.near!.length === 4 && measureNear(q, qn(0), budgetsOf(q), qFirst.far) === null,
    JSON.stringify({ before: [...qFirst.far.near!], after: [...qNow.far.near!] }));
}

/* ---------- Kept answers: the lists of rings 1–3 have their own limit, answers stay (no database) ---------- */
{
  // Production limits: 20,000 answers, 4,000,000 numbers in lists. 5,000 people ask in turn, each with 1,171
  // people in rings 1–3 (5.9 million numbers, more than the lists may hold), three rounds on an unchanged graph.
  const keeper = new ReachKeeper<{ far: FarSnapshot; round: number }>(20_000, 4_000_000);
  const list = () => new Int32Array(1171);
  const snapshot = (): FarSnapshot => ({ byDepth: {}, people: 600, canHelp: 0, graphId: 1, size: 1, near: list() });
  let misses = 0;
  for (let round = 0; round < 3; round++) {
    for (let p = 0; p < 5000; p++) {
      const key = `p${p}`;
      if (keeper.get(key)) continue;
      misses++;
      keeper.set(key, { far: snapshot(), round });
    }
  }
  const withList = [...Array(5000).keys()].filter((p) => keeper.get(`p${p}`)?.far.near).length;
  check('a round of 5,000 people over the list limit keeps every answer: later rounds never miss',
    misses === 5000 && keeper.size === 5000, `misses ${misses}, kept ${keeper.size}`);
  check('…only the oldest answers lose their list, and the lists stay within the limit',
    keeper.keptIds <= 4_000_000 && withList === Math.floor(4_000_000 / 1171) && !keeper.get('p0')!.far.near && !!keeper.get('p4999')!.far.near,
    `${withList} answers keep a list, ${keeper.keptIds} numbers`);
  // An answer that lost its list cannot reuse its far part: measureNear refuses it and the caller walks in full
  check('…and an answer without a list never reuses its far part',
    measureNear(build0(), 0, new Float32Array(4), keeper.get('p0')!.far) === null);
  // A walk takes a kept far part, then waits for the graph and budgets; meanwhile other answers push its list out
  const race = new ReachKeeper<{ far: FarSnapshot }>(20_000, 3 * 1171);
  race.set('me', { far: snapshot() });
  const taken = race.get('me')!;
  const takenFar = taken.far;
  check('a kept far part is reusable while its answer still holds it with its list', stillReusable(race, 'me', taken, takenFar) === takenFar);
  for (let p = 0; p < 3; p++) race.set(`other${p}`, { far: snapshot() }); // during the awaits
  check('…and not once the keeper dropped that list while the walk waited (the walk goes in full)',
    stillReusable(race, 'me', taken, takenFar) === null && race.get('me') === taken && taken.far.near === null);
  race.delete('me');
  race.set('me', { far: snapshot() });
  check('…nor when the answer itself was replaced meanwhile', stillReusable(race, 'me', taken, takenFar) === null);
  // The answer limit still holds on its own
  const small = new ReachKeeper<{ far: FarSnapshot }>(100, 1_000_000);
  for (let p = 0; p < 150; p++) small.set(`s${p}`, { far: snapshot() });
  check('the number of kept answers stays within its own limit', small.size <= 100 && !small.get('s0') && !!small.get('s149'), `${small.size}`);
}

/* ---------- Cost: the walk with and without the exact check of rings 1–3 (no database) ---------- */
{
  // A synthetic network like README's cost model: BENCH_PEOPLE people (default 100,000), about 6.4 connections
  // each to people who joined before them, mostly near in the joining order (friends of friends), some anywhere
  const people = Number(process.env.BENCH_PEOPLE) || 100_000;
  const bb = new GraphBuilder();
  let edges = 0;
  for (let i = 1; i < people; i++) {
    const links = i < 8 ? 1 : 6 + (random() < 0.4 ? 1 : 0);
    for (let k = 0; k < links; k++) {
      const j = random() < 0.85 ? Math.max(0, i - 1 - pick(Math.min(i, 400))) : pick(i);
      if (j !== i) { bb.add(`b${i}`, `b${j}`, i); edges++; }
    }
  }
  const big = bb.finish();
  const weights = new Float32Array(big.size).fill(1);
  const roots = Array.from({ length: 20 }, () => pick(big.size));
  const time = (fn: () => void) => {
    fn(); // warm up
    const startedAt = performance.now();
    for (let r = 0; r < 3; r++) fn();
    return (performance.now() - startedAt) / 3 / roots.length;
  };
  let nearPeople = 0;
  const plain = time(() => { for (const r of roots) big.tally(r, NETWORK_MAX_DEPTH, weights, 3); });
  const withList = time(() => { for (const r of roots) nearPeople = measureFull(big, r, weights).far.near?.length ?? -1; });
  const snapshots = roots.map((r) => measureFull(big, r, weights).far);
  const nearOnly = time(() => { roots.forEach((r, k) => measureNear(big, r, weights, snapshots[k]!)); });
  const reusedOk = roots.every((r, k) => measureNear(big, r, weights, snapshots[k]!) !== null || snapshots[k]!.near === null);
  console.log(`cost on ${big.peopleCount} people, ${big.edgeCount} connections (${edges} added): ` +
    `walk to the 6th ${plain.toFixed(2)} ms; with the list of rings 1–3 kept ${withList.toFixed(2)} ms; ` +
    `rings 1–3 again with the exact check ${nearOnly.toFixed(2)} ms (last root: ${nearPeople} people in rings 1–3)`);
  check('cost: the kept list adds little to a full walk, and an unchanged network reuses its far part',
    withList < plain * 1.5 + 1 && reusedOk, `${plain.toFixed(2)} vs ${withList.toFixed(2)} ms`);
}

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
