/**
 * Settled node positions shared by every NetworkGraph. The map outlives unmount.
 * Keyed by the centre node so two people never share a layout.
 * Persisted at `so.graph.layout.v2:<centerId>` when the simulation stops, not per tick.
 */

export interface LayoutPoint {
  x: number;
  y: number;
  z: number;
}

export interface LayoutSample {
  id: string;
  x?: number;
  y?: number;
  z?: number;
  depth?: number;
}

const PREFIX = 'so.graph.layout.v2:'; // v2: denser forces (2026-11-09), old sparse layouts are not reused
const MAX_NODES = 2000;

const owners = new Map<string, Map<string, LayoutPoint>>();
const lastPayload = new Map<string, string>();

function storage(): Storage | null {
  try {
    const store = (globalThis as { localStorage?: Storage }).localStorage;
    return store ?? null;
  } catch {
    return null;
  }
}

function asPoint(value: unknown): LayoutPoint | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const v = value as { x?: unknown; y?: unknown; z?: unknown };
  if (typeof v.x !== 'number' || typeof v.y !== 'number' || typeof v.z !== 'number') return null;
  if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return null;
  return { x: v.x, y: v.y, z: v.z };
}

function readStorage(centerId: string): Map<string, LayoutPoint> {
  const map = new Map<string, LayoutPoint>();
  const store = storage();
  if (!store) return map;
  let raw: string | null;
  try {
    raw = store.getItem(PREFIX + centerId);
  } catch {
    return map;
  }
  if (!raw) return map;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return map;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return map;
  for (const [id, value] of Object.entries(parsed)) {
    if (map.size >= MAX_NODES) break;
    if (!id) continue;
    const point = asPoint(value);
    if (!point) continue;
    map.set(id, point);
  }
  if (map.size > 0) lastPayload.set(centerId, JSON.stringify(Object.fromEntries(map)));
  return map;
}

/** Positions for this owner. Loads localStorage once; later reads are the shared map. */
export function layoutOf(centerId: string): ReadonlyMap<string, LayoutPoint> {
  if (!centerId) return new Map();
  const hit = owners.get(centerId);
  if (hit) return hit;
  const map = readStorage(centerId);
  owners.set(centerId, map);
  return map;
}

/**
 * Replace this owner's layout with the nodes still in the graph.
 * Drops anyone who left. Keeps at most 2000, preferring smaller depth.
 * Skips non-finite coordinates. Identical payloads are not written again.
 */
export function writeLayout(centerId: string, nodes: Iterable<LayoutSample>): void {
  if (!centerId) return;
  const list = [...nodes];
  if (list.length > MAX_NODES) {
    list.sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99));
  }
  const map = new Map<string, LayoutPoint>();
  for (const n of list) {
    if (map.size >= MAX_NODES) break;
    if (!n.id) continue;
    const point = asPoint({ x: n.x, y: n.y, z: n.z });
    if (!point) continue;
    map.set(n.id, point);
  }
  if (map.size === 0) return;
  owners.set(centerId, map);
  const payload = JSON.stringify(Object.fromEntries(map));
  if (lastPayload.get(centerId) === payload) return;
  lastPayload.set(centerId, payload);
  const store = storage();
  if (!store) return;
  try {
    store.setItem(PREFIX + centerId, payload);
  } catch {
    /* quota or private mode: the in-memory map still survives unmount */
  }
}

/**
 * Owners whose last saved layout was taken while the simulation was still moving (the person left the
 * screen early). Their positions are a good start, but not final: the next graph lets them settle
 * instead of freezing them half-way. In memory only; a reload trusts the stored layout.
 */
const unsettled = new Set<string>();

export function setLayoutSettled(centerId: string, settled: boolean): void {
  if (!centerId) return;
  if (settled) unsettled.delete(centerId);
  else unsettled.add(centerId);
}

export function isLayoutSettled(centerId: string): boolean {
  return !unsettled.has(centerId);
}

/** Nodes already shown once per owner, so coming back to the graph does not replay the pop-in. */
const introSeen = new Map<string, Set<string>>();

export function introSeenOf(centerId: string): Set<string> {
  let set = introSeen.get(centerId);
  if (!set) {
    set = new Set();
    introSeen.set(centerId, set);
  }
  return set;
}
