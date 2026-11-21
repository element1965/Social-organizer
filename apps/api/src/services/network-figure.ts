/**
 * The network figure, computed from the graph in memory. No database here: network.service.ts brings the
 * graph and the budgets, keeps the answers per person and decides when to walk; this file only counts,
 * so scripts/check-graph-store.ts can check it on a graph built in memory.
 */
import type { HandshakeGraph } from './graph-store.js';

/**
 * How far the network reaches: a Need's waves go out from the author, nearest first, up to this many
 * handshakes, the request gate counts people up to here, and the network figure on every screen
 * ("N people in your network", "Declared participation of the network") counts the same people.
 */
export const NETWORK_MAX_DEPTH = 6;
/** Rings whose people are shown by name (graph, People lists). Beyond them only one rounded count. */
export const VISIBLE_RINGS = 3;

export type FarCount = { count: number; approx: boolean; few: boolean };

/**
 * Rounds a count of people the viewer may not see, so it cannot be used to tell when one
 * particular person joined or left: under 5 is only "a few", then steps of 10, 50, then 2 significant digits.
 */
export function roundFarCount(n: number): FarCount {
  if (n <= 0) return { count: 0, approx: false, few: false };
  if (n < 5) return { count: 0, approx: true, few: true };
  const step = n < 100 ? 10 : n < 1000 ? 50 : 10 ** (Math.floor(Math.log10(n)) - 1);
  const count = Math.max(step, Math.round(n / step) * step);
  return { count, approx: true, few: false };
}

/**
 * The network numbers of one person, from one walk to the 6th handshake. The person themselves is never
 * counted. Only `visible`, the rings 1–3 in `byDepth`, `far`, `people` and `canHelp` may leave the server.
 */
export interface NetworkReach {
  /** People at each handshake, 1st to 6th, exact: beyond the visible rings for the server only */
  byDepth: Record<number, number>;
  /** Everyone up to the 6th handshake, exact: for the server-side request gate only, never shown */
  exact: number;
  /** People in the visible rings 1–3 (exact: they are shown by name) */
  visible: number;
  /**
   * The 4th to 6th rings together, rounded once (`roundFarCount`): the one projection of the far rings.
   * The far chip, the headline and the gate's progress all use this same value, so no difference of two
   * shown numbers gives an exact count for any far ring. "A few" counts as 0 in `people`.
   */
  far: FarCount;
  /** Display figure up to the 6th handshake, `visible + far.count`. Exact only when `far.approx` is false. */
  people: number;
  /** The network figure: the sum of saved intentions up to the 6th handshake */
  canHelp: number;
}

interface Part {
  byDepth: Record<number, number>;
  people: number;
  canHelp: number;
}

const NOBODY: Part = { byDepth: {}, people: 0, canHelp: 0 };

/**
 * Most people kept per snapshot for the exact check of rings 1–3 (4 bytes each, so at most 200 KB). A person
 * with more people in rings 1–3 keeps none: their far part is never reused, and when their answer is stale
 * they are walked in full (at most once a minute while asked, like everyone after a change).
 */
export const NEAR_IDS_MAX = 50_000;

/**
 * The far rings of a full walk, kept so that later answers can walk only the visible rings, and how the
 * visible rings looked then: which graph (a full reload renumbers everyone), how many people the graph had,
 * and exactly who was in rings 1–3 (their numbers; null above NEAR_IDS_MAX, and then no reuse).
 */
export interface FarSnapshot extends Part {
  graphId: number;
  size: number;
  near: Int32Array | null;
}

const graphIds = new WeakMap<HandshakeGraph, number>();
let nextGraphId = 1;

function graphId(graph: HandshakeGraph): number {
  let id = graphIds.get(graph);
  if (id === undefined) graphIds.set(graph, (id = nextGraphId++));
  return id;
}

function compose(near: Part, far: Part): NetworkReach {
  const visible = near.people;
  const farCount = roundFarCount(far.people);
  return {
    byDepth: { ...near.byDepth, ...far.byDepth },
    exact: visible + far.people,
    visible,
    far: farCount,
    people: visible + farCount.count,
    canHelp: Math.round(near.canHelp + far.canHelp),
  };
}

function split(byDepth: number[], maxDepth: number): { near: Part; far: Part } {
  const near: Part = { byDepth: {}, people: 0, canHelp: 0 };
  const far: Part = { byDepth: {}, people: 0, canHelp: 0 };
  for (let depth = 1; depth <= maxDepth; depth++) {
    const n = byDepth[depth] ?? 0;
    if (n === 0) continue;
    const part = depth <= VISIBLE_RINGS ? near : far;
    part.byDepth[depth] = n;
    part.people += n;
  }
  return { near, far };
}

/**
 * The whole reach from `root` to the 6th handshake in one walk. `budgets` is what each person (by number)
 * can still give. Synchronous: nothing in the graph or the budgets can change while it runs.
 */
export function measureFull(
  graph: HandshakeGraph,
  root: number | undefined,
  budgets: Float32Array,
): { value: NetworkReach; far: FarSnapshot } {
  const snapshot = { graphId: graphId(graph), size: graph.size };
  if (root === undefined) {
    return { value: compose(NOBODY, NOBODY), far: { ...NOBODY, ...snapshot, near: null } };
  }
  const t = graph.tally(root, NETWORK_MAX_DEPTH, budgets, VISIBLE_RINGS);
  const { near, far } = split(t.byDepth, NETWORK_MAX_DEPTH);
  near.canHelp = t.nearWeight;
  far.canHelp = t.weight - t.nearWeight;
  // Who is in rings 1–3 now, from the walk's own queue (every number is below graph.size)
  const nearIds = near.people <= NEAR_IDS_MAX ? graph.lastTallyMembers(t.nearEnd, graph.size) : null;
  return { value: compose(near, far), far: { ...far, ...snapshot, near: nearIds } };
}

/**
 * The visible rings walked again, with the far rings of an earlier full walk. Returns null when that
 * cannot be done without counting someone twice or not at all, and the caller then walks in full:
 * - the graph was reloaded (people renumbered);
 * - anyone who was in the graph at the earlier walk entered or left rings 1–3 since. Such a person may
 *   have come from the far rings (counted there, now counted again here) or gone there (counted nowhere).
 *   People added to the graph since then cannot be in the kept far part, so they never force a full walk.
 */
export function measureNear(
  graph: HandshakeGraph,
  root: number | undefined,
  budgets: Float32Array,
  far: FarSnapshot,
): NetworkReach | null {
  if (root === undefined || !far.near || graphId(graph) !== far.graphId) return null;
  const t = graph.tally(root, VISIBLE_RINGS, budgets, VISIBLE_RINGS);
  // Exactly the same people of the old graph in rings 1–3: as many of them as then, and every one kept was
  // reached again (this walk stops at the 3rd ring, so reached means in rings 1–3). Deleted people are not reached.
  if (graph.countLastTallyBelow(t.nearEnd, far.size) !== far.near.length) return null;
  for (let i = 0; i < far.near.length; i++) if (!graph.reachedByLastWalk(far.near[i]!)) return null;
  const { near } = split(t.byDepth, VISIBLE_RINGS);
  near.canHelp = t.nearWeight;
  return compose(near, far);
}

/**
 * The kept answers, one per person, with two separate limits:
 * - at most `maxEntries` answers; past it the oldest tenth goes (a Map keeps insertion order);
 * - at most `maxNearIds` person numbers in the rings 1–3 lists over all answers; past it the oldest answers lose
 *   only their list (`far.near` = null) and stay as answers: they are still served while fresh, and when stale
 *   they cannot reuse their far part and are walked in full. So a round of many people asking in turn keeps
 *   being answered from memory however many lists the budget holds.
 */
export class ReachKeeper<E extends { far: FarSnapshot }> {
  private readonly entries = new Map<string, E>();
  /** Answers that keep a list, oldest first, with the list's length */
  private readonly lists = new Map<string, number>();
  private nearIds = 0;

  constructor(
    private readonly maxEntries: number,
    private readonly maxNearIds: number,
  ) {}

  get(key: string): E | undefined {
    return this.entries.get(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Person numbers kept in lists over all answers */
  get keptIds(): number {
    return this.nearIds;
  }

  delete(key: string): void {
    this.forgetList(key);
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.lists.clear();
    this.nearIds = 0;
  }

  set(key: string, entry: E): void {
    this.delete(key);
    if (this.entries.size >= this.maxEntries) {
      let drop = Math.max(1, Math.floor(this.maxEntries / 10));
      for (const old of this.entries.keys()) {
        this.delete(old);
        if (--drop <= 0) break;
      }
    }
    this.entries.set(key, entry);
    const ids = entry.far.near?.length ?? 0;
    if (ids === 0) return;
    this.lists.set(key, ids);
    this.nearIds += ids;
    for (const old of this.lists.keys()) {
      if (this.nearIds <= this.maxNearIds) break;
      const kept = this.entries.get(old);
      this.forgetList(old);
      if (kept) kept.far = { ...kept.far, near: null };
    }
  }

  private forgetList(key: string): void {
    const ids = this.lists.get(key);
    if (ids === undefined) return;
    this.nearIds -= ids;
    this.lists.delete(key);
  }
}

/**
 * The far part a pending walk may still reuse, checked right before measuring (no await in between): the kept
 * answer is still the same object, still holds this very snapshot (the keeper did not drop its list while the
 * walk waited for the graph and budgets), and the snapshot has its list. Otherwise null: walk in full.
 */
export function stillReusable<E extends { far: FarSnapshot }>(
  keeper: ReachKeeper<E>,
  key: string,
  entry: E,
  far: FarSnapshot,
): FarSnapshot | null {
  return keeper.get(key) === entry && entry.far === far && far.near ? far : null;
}

/**
 * The reach with the graph and budgets already in hand: the visible rings with the kept far part when that is
 * safe (measureNear), otherwise one full walk on the same graph and budgets.
 */
export function measure(
  graph: HandshakeGraph,
  root: number | undefined,
  budgets: Float32Array,
  reuse: FarSnapshot | null,
): { value: NetworkReach; far: FarSnapshot; reused: boolean } {
  if (reuse) {
    const value = measureNear(graph, root, budgets, reuse);
    if (value) return { value, far: reuse, reused: true };
  }
  return { ...measureFull(graph, root, budgets), reused: false };
}
