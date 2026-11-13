/**
 * The handshake graph as numbers.
 *
 * People are numbered in the order they are first seen; a connection is two entries, one in each
 * person's list of neighbours. The lists live in three flat arrays (compressed rows: where a person's
 * list starts, the neighbour, when the connection was made), so a million people with thirteen
 * connections each take about 160 MB instead of 1.6 GB of objects, and a walk reads memory in order.
 *
 * The flat arrays are built once and then only patched:
 * - a new connection goes to a small per-person overflow list;
 * - a removed connection leaves a hole (-1) in the flat list or is cut out of the overflow;
 * - when overflow and holes grow past a tenth of the graph, `compact()` rebuilds the flat arrays.
 * A person's number never changes, so walks, caches and arrays kept beside the graph stay valid.
 *
 * Nothing here touches the database: graph-cache.service loads and updates it.
 */

/** Grows by this factor when a per-person array runs out. */
const GROW = 1.5;
/** Overflow and holes are tolerated up to this many entries, and beyond it up to a tenth of the graph. */
const COMPACT_MIN = 20_000;

export class HandshakeGraph {
  /** Person number → user id */
  readonly ids: string[] = [];
  private readonly numberOf = new Map<string, number>();

  // Flat lists, valid for people below `flatPeople`
  private flatPeople = 0;
  private start = new Int32Array(1);
  private neighbour = new Int32Array(0);
  private madeAt = new Float64Array(0);
  // Connections made after the flat lists were built: person → [neighbour, madeAt, neighbour, madeAt, …]
  private overflow = new Map<number, number[]>();
  private overflowEntries = 0;
  private holes = 0;

  // Per person
  private degrees = new Int32Array(1024);
  private deletedFlags = new Uint8Array(1024);
  /** 1 when the person has an overflow list: walks look in the map only then */
  private looseFlags = new Uint8Array(1024);

  /** Deleted accounts: never reached by a walk and never a way through (unless a walk asks otherwise). */
  deletedCount = 0;
  /** Connections, each counted once */
  edgeCount = 0;
  /** People with at least one connection */
  peopleCount = 0;

  // Scratch for synchronous walks: nothing may await between a walk and reading its result
  private seenAt = new Int32Array(0);
  private stamp = 0;
  private queue = new Int32Array(0);
  private parent = new Int32Array(0);
  private pathAt = new Float64Array(0);

  get size(): number {
    return this.ids.length;
  }

  /** The person's number, or undefined when the graph has never seen them. */
  find(userId: string): number | undefined {
    return this.numberOf.get(userId);
  }

  /** The person's number; a new person gets the next one. */
  person(userId: string): number {
    let n = this.numberOf.get(userId);
    if (n !== undefined) return n;
    n = this.ids.length;
    this.ids.push(userId);
    this.numberOf.set(userId, n);
    if (n >= this.degrees.length) {
      const capacity = Math.ceil(this.degrees.length * GROW) + 1;
      const degrees = new Int32Array(capacity);
      degrees.set(this.degrees);
      this.degrees = degrees;
      const flags = new Uint8Array(capacity);
      flags.set(this.deletedFlags);
      this.deletedFlags = flags;
      const loose = new Uint8Array(capacity);
      loose.set(this.looseFlags);
      this.looseFlags = loose;
    }
    return n;
  }

  degree(n: number): number {
    return this.degrees[n] ?? 0;
  }

  isDeleted(n: number): boolean {
    return this.deletedFlags[n] === 1;
  }

  setDeleted(n: number, deleted: boolean): void {
    const was = this.deletedFlags[n] === 1;
    if (was === deleted) return;
    this.deletedFlags[n] = deleted ? 1 : 0;
    this.deletedCount += deleted ? 1 : -1;
  }

  /** Calls `visit` for every neighbour of a person. */
  eachNeighbour(n: number, visit: (neighbour: number, madeAt: number) => void): void {
    if (n < this.flatPeople) {
      const { neighbour, madeAt } = this;
      for (let p = this.start[n]!, end = this.start[n + 1]!; p < end; p++) {
        const m = neighbour[p]!;
        if (m >= 0) visit(m, madeAt[p]!);
      }
    }
    const extra = this.overflow.get(n);
    if (extra) for (let k = 0; k < extra.length; k += 2) visit(extra[k]!, extra[k + 1]!);
  }

  neighbours(n: number): number[] {
    const out: number[] = [];
    this.eachNeighbour(n, (m) => out.push(m));
    return out;
  }

  hasEdge(a: number, b: number): boolean {
    // The shorter list is searched
    const [from, to] = this.degree(a) <= this.degree(b) ? [a, b] : [b, a];
    if (from < this.flatPeople) {
      const { neighbour } = this;
      for (let p = this.start[from]!, end = this.start[from + 1]!; p < end; p++) if (neighbour[p] === to) return true;
    }
    const extra = this.overflow.get(from);
    if (extra) for (let k = 0; k < extra.length; k += 2) if (extra[k] === to) return true;
    return false;
  }

  /** Adds a connection; false when the two are already connected (or it is one person). */
  addEdge(a: number, b: number, madeAt: number): boolean {
    if (a === b || this.hasEdge(a, b)) return false;
    this.pushOverflow(a, b, madeAt);
    this.pushOverflow(b, a, madeAt);
    this.edgeCount++;
    return true;
  }

  private pushOverflow(n: number, neighbour: number, madeAt: number): void {
    let list = this.overflow.get(n);
    if (!list) {
      this.overflow.set(n, (list = []));
      this.looseFlags[n] = 1;
    }
    list.push(neighbour, madeAt);
    this.overflowEntries++;
    if (this.degrees[n]!++ === 0) this.peopleCount++;
  }

  /** Cuts `neighbour` out of `n`'s list; true when it was there. */
  private dropOneSide(n: number, neighbour: number): boolean {
    if (n < this.flatPeople) {
      const list = this.neighbour;
      for (let p = this.start[n]!, end = this.start[n + 1]!; p < end; p++) {
        if (list[p] === neighbour) {
          list[p] = -1;
          this.holes++;
          return true;
        }
      }
    }
    const extra = this.overflow.get(n);
    if (extra) {
      for (let k = 0; k < extra.length; k += 2) {
        if (extra[k] === neighbour) {
          extra.splice(k, 2);
          this.overflowEntries--;
          if (extra.length === 0) {
            this.overflow.delete(n);
            this.looseFlags[n] = 0;
          }
          return true;
        }
      }
    }
    return false;
  }

  /** Takes every connection of one person out of the graph, on both sides. */
  removePerson(n: number): void {
    for (const m of this.neighbours(n)) {
      if (this.dropOneSide(m, n) && --this.degrees[m]! === 0) this.peopleCount--;
      this.edgeCount--;
    }
    if (n < this.flatPeople) {
      const list = this.neighbour;
      for (let p = this.start[n]!, end = this.start[n + 1]!; p < end; p++) {
        if (list[p]! >= 0) {
          list[p] = -1;
          this.holes++;
        }
      }
    }
    const extra = this.overflow.get(n);
    if (extra) {
      this.overflowEntries -= extra.length / 2;
      this.overflow.delete(n);
      this.looseFlags[n] = 0;
    }
    if (this.degrees[n]! > 0) this.peopleCount--;
    this.degrees[n] = 0;
  }

  /** Overflow and holes have grown enough for the flat lists to be worth rebuilding. */
  needsCompaction(): boolean {
    return this.overflowEntries + this.holes > Math.max(COMPACT_MIN, this.edgeCount / 5);
  }

  /** Rebuilds the flat lists from the current state. People keep their numbers. */
  compact(): void {
    const people = this.ids.length;
    const start = new Int32Array(people + 1);
    for (let n = 0; n < people; n++) start[n + 1] = start[n]! + this.degrees[n]!;
    const total = start[people]!;
    const neighbour = new Int32Array(total);
    const madeAt = new Float64Array(total);
    for (let n = 0; n < people; n++) {
      let p = start[n]!;
      this.eachNeighbour(n, (m, at) => {
        neighbour[p] = m;
        madeAt[p] = at;
        p++;
      });
    }
    this.start = start;
    this.neighbour = neighbour;
    this.madeAt = madeAt;
    this.flatPeople = people;
    this.overflow = new Map();
    this.looseFlags.fill(0);
    this.overflowEntries = 0;
    this.holes = 0;
  }

  /**
   * Fills the flat lists of an empty graph from `count` connections given as person numbers.
   * Bulk load only: the caller guarantees every pair is there once.
   */
  loadFlat(a: Int32Array, b: Int32Array, at: Float64Array, count: number): void {
    if (this.edgeCount !== 0) throw new Error('loadFlat needs an empty graph');
    const people = this.ids.length;
    const degrees = this.degrees;
    for (let i = 0; i < count; i++) {
      degrees[a[i]!]!++;
      degrees[b[i]!]!++;
    }
    const start = new Int32Array(people + 1);
    for (let n = 0; n < people; n++) {
      start[n + 1] = start[n]! + degrees[n]!;
      if (degrees[n]! > 0) this.peopleCount++;
    }
    const neighbour = new Int32Array(2 * count);
    const madeAt = new Float64Array(2 * count);
    const next = start.slice(0, people);
    for (let i = 0; i < count; i++) {
      const pa = next[a[i]!]!++;
      neighbour[pa] = b[i]!;
      madeAt[pa] = at[i]!;
      const pb = next[b[i]!]!++;
      neighbour[pb] = a[i]!;
      madeAt[pb] = at[i]!;
    }
    this.start = start;
    this.neighbour = neighbour;
    this.madeAt = madeAt;
    this.flatPeople = people;
    this.edgeCount = count;
  }

  /** How much of the graph sits outside the flat lists (for metrics and checks). */
  looseness(): { overflow: number; holes: number } {
    return { overflow: this.overflowEntries, holes: this.holes };
  }

  /* ---------- Walks ---------- */

  private scratch(): void {
    if (this.seenAt.length >= this.ids.length) return;
    const capacity = Math.ceil(this.ids.length * GROW) + 16;
    // Old marks are dropped with the array: start the stamps again
    this.seenAt = new Int32Array(capacity);
    this.stamp = 0;
    this.queue = new Int32Array(capacity);
    this.parent = new Int32Array(capacity);
    this.pathAt = new Float64Array(capacity);
  }

  /**
   * Breadth-first from `root`, nearest first, up to `maxDepth` handshakes. `visit` gets every person
   * reached (never the root) with their depth and the newest connection time on the way to them; it may
   * return false to stop the walk. Deleted accounts are skipped and not passed through, unless
   * `throughDeleted` is set (then they are reached like anyone else).
   *
   * Synchronous and not re-entrant: `visit` must not start another walk on this graph.
   * Returns how many people were reached.
   */
  walk(
    root: number,
    maxDepth: number,
    visit: (person: number, depth: number, newestAt: number) => boolean | void,
    throughDeleted = false,
  ): number {
    this.scratch();
    if (this.stamp >= 0x7fffffff) {
      this.seenAt.fill(0);
      this.stamp = 0;
    }
    const stamp = ++this.stamp;
    const { seenAt, queue, parent, pathAt, deletedFlags } = this;
    seenAt[root] = stamp;
    parent[root] = -1;
    pathAt[root] = 0;
    queue[0] = root;
    let head = 0;
    let tail = 1;
    let stopped = false;
    for (let depth = 1; depth <= maxDepth && head < tail && !stopped; depth++) {
      const end = tail;
      for (; head < end && !stopped; head++) {
        const from = queue[head]!;
        const fromAt = pathAt[from]!;
        // Inlined eachNeighbour: this loop is the hot path of every network number
        if (from < this.flatPeople) {
          const { neighbour, madeAt } = this;
          for (let p = this.start[from]!, last = this.start[from + 1]!; p < last; p++) {
            const m = neighbour[p]!;
            if (m < 0 || seenAt[m] === stamp || (!throughDeleted && deletedFlags[m] === 1)) continue;
            seenAt[m] = stamp;
            parent[m] = from;
            const at = madeAt[p]!;
            pathAt[m] = at > fromAt ? at : fromAt;
            queue[tail++] = m;
            if (visit(m, depth, pathAt[m]!) === false) {
              stopped = true;
              break;
            }
          }
        }
        if (stopped) break;
        const extra = this.looseFlags[from] === 1 ? this.overflow.get(from) : undefined;
        if (extra) {
          for (let k = 0; k < extra.length; k += 2) {
            const m = extra[k]!;
            if (seenAt[m] === stamp || (!throughDeleted && deletedFlags[m] === 1)) continue;
            seenAt[m] = stamp;
            parent[m] = from;
            const at = extra[k + 1]!;
            pathAt[m] = at > fromAt ? at : fromAt;
            queue[tail++] = m;
            if (visit(m, depth, pathAt[m]!) === false) {
              stopped = true;
              break;
            }
          }
        }
      }
    }
    return tail - 1;
  }

  /**
   * The walk behind every network number: how many people are at each handshake from `root`, and the sum
   * of `weights` (what they can give) over them, with the part from the first `nearDepth` rings apart.
   * The same people as `walk` reaches, without a call per person and without paths.
   */
  tally(
    root: number,
    maxDepth: number,
    weights: Float32Array,
    nearDepth: number,
  ): { byDepth: number[]; people: number; weight: number; nearWeight: number } {
    this.scratch();
    if (this.stamp >= 0x7fffffff) {
      this.seenAt.fill(0);
      this.stamp = 0;
    }
    const stamp = ++this.stamp;
    const { seenAt, queue, deletedFlags, looseFlags, start, neighbour, flatPeople } = this;
    const weighed = weights.length;
    const byDepth = new Array<number>(maxDepth + 1).fill(0);
    let weight = 0;
    let nearWeight = 0;
    seenAt[root] = stamp;
    queue[0] = root;
    let head = 0;
    let tail = 1;
    for (let depth = 1; depth <= maxDepth && head < tail; depth++) {
      const end = tail;
      let ringWeight = 0;
      for (; head < end; head++) {
        const from = queue[head]!;
        if (from < flatPeople) {
          for (let p = start[from]!, last = start[from + 1]!; p < last; p++) {
            const m = neighbour[p]!;
            if (m < 0 || seenAt[m] === stamp || deletedFlags[m] === 1) continue;
            seenAt[m] = stamp;
            queue[tail++] = m;
            if (m < weighed) ringWeight += weights[m]!;
          }
        }
        if (looseFlags[from] === 1) {
          const extra = this.overflow.get(from)!;
          for (let k = 0; k < extra.length; k += 2) {
            const m = extra[k]!;
            if (seenAt[m] === stamp || deletedFlags[m] === 1) continue;
            seenAt[m] = stamp;
            queue[tail++] = m;
            if (m < weighed) ringWeight += weights[m]!;
          }
        }
      }
      byDepth[depth] = tail - end;
      weight += ringWeight;
      if (depth <= nearDepth) nearWeight += ringWeight;
    }
    return { byDepth, people: tail - 1, weight, nearWeight };
  }

  /** The handshake path from the root of the last walk to a person it reached, both included. */
  pathOfLastWalk(person: number): number[] {
    const out: number[] = [];
    for (let n = person; n >= 0; n = this.parent[n]!) out.push(n);
    return out.reverse();
  }

  /** Arrays of finished pooled ring walks, ready for the next one. */
  private ringPool: Array<{ seen: Uint8Array; parent: Int32Array; newestAt: Float64Array }> = [];

  /**
   * The same walk handed out one ring at a time, for callers that wait between rings (a wave asks the
   * database about each ring). It keeps its own marks, so other walks may run in between. People who
   * join the graph after it started are not reached.
   *
   * `pooled`: the walk borrows its arrays and gives them back when the loop over it ends (short walks
   * that run for every screen would otherwise allocate megabytes each). `parent` and `newestAt` of a
   * pooled walk are valid only until then; without it they stay valid as long as someone holds them.
   */
  *rings(root: number, maxDepth: number, pooled = false): Generator<RingOfWalk, void, void> {
    const people = this.ids.length;
    let state = pooled ? this.ringPool.pop() : undefined;
    if (!state || state.seen.length < people) {
      const capacity = pooled ? Math.ceil(people * GROW) + 16 : people;
      state = { seen: new Uint8Array(capacity), parent: new Int32Array(capacity), newestAt: new Float64Array(capacity) };
    }
    const { seen, parent, newestAt } = state;
    const touched: number[] = [root];
    seen[root] = 1;
    parent[root] = -1;
    newestAt[root] = 0;
    try {
      let frontier: number[] = [root];
      for (let depth = 1; depth <= maxDepth && frontier.length > 0; depth++) {
        const next: number[] = [];
        for (const from of frontier) {
          const fromAt = newestAt[from]!;
          this.eachNeighbour(from, (m, at) => {
            if (m >= people || seen[m] === 1 || this.deletedFlags[m] === 1) return;
            seen[m] = 1;
            parent[m] = from;
            newestAt[m] = at > fromAt ? at : fromAt;
            next.push(m);
            if (pooled) touched.push(m);
          });
        }
        frontier = next;
        if (next.length > 0) yield { depth, people: next, parent, newestAt };
      }
    } finally {
      // A pooled walk hands its arrays back clean; everything read from them must be read by now
      if (pooled) {
        for (const n of touched) seen[n] = 0;
        if (this.ringPool.length < 4) this.ringPool.push(state);
      }
    }
  }
}

export interface RingOfWalk {
  depth: number;
  /** People at this handshake, in the order the walk reached them */
  people: number[];
  /** Person → the person the walk came from (-1 for the root); shared by all rings of one walk */
  parent: Int32Array;
  /** Person → the newest connection time on the way to them */
  newestAt: Float64Array;
}

/**
 * Builds a graph from rows read in bulk: every row is a connection that exists once (the table has a
 * unique pair), so nothing is checked and the flat lists are filled directly.
 */
export class GraphBuilder {
  private readonly graph = new HandshakeGraph();
  private a = new Int32Array(1 << 16);
  private b = new Int32Array(1 << 16);
  private at = new Float64Array(1 << 16);
  private count = 0;

  add(userAId: string, userBId: string, madeAt: number): void {
    if (this.count === this.a.length) {
      const capacity = this.count * 2;
      const a = new Int32Array(capacity);
      a.set(this.a);
      this.a = a;
      const b = new Int32Array(capacity);
      b.set(this.b);
      this.b = b;
      const at = new Float64Array(capacity);
      at.set(this.at);
      this.at = at;
    }
    this.a[this.count] = this.graph.person(userAId);
    this.b[this.count] = this.graph.person(userBId);
    this.at[this.count] = madeAt;
    this.count++;
  }

  finish(): HandshakeGraph {
    this.graph.loadFlat(this.a, this.b, this.at, this.count);
    return this.graph;
  }
}
