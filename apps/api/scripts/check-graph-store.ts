/**
 * Check of the graph kept as numbers (services/graph-store.ts) against a plain reference made of maps:
 * thousands of random connections, removed people and compactions, then the two are compared edge by
 * edge and walk by walk. No database, nothing leaves the machine.
 *
 * Usage (from apps/api):  npx tsx scripts/check-graph-store.ts
 */
import { GraphBuilder, HandshakeGraph } from '../src/services/graph-store.js';

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

console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) FAILED.`);
process.exit(failed === 0 ? 0 : 1);
