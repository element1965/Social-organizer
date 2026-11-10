import { clearLocal, type GraphBackup, type SavedContact, type SavedPerson } from '@so/gun-backup';

/** A person from the copy saved on this device. */
export type SavedEntry = {
  id: string;
  /** My name for a direct connection, otherwise the account name. */
  name: string;
  accountName: string;
  /** Handshake level: 1 = direct. */
  depth: number;
  /** Names between me and the person, nearest to me first. */
  via: string[];
};

export type SavedModel = {
  syncedAt: string;
  levels: Record<1 | 2 | 3, SavedEntry[]>;
  byId: Map<string, SavedEntry>;
  total: number;
};

/** Handshake level of every node: the saved depth, or a walk over the saved edges for copies without it. */
function depths(copy: GraphBackup): Map<string, number> {
  const out = new Map<string, number>();
  for (const node of copy.nodes) if (typeof node.depth === 'number') out.set(node.id, node.depth);
  if (out.has(copy.userId) && copy.nodes.every((n) => out.has(n.id))) return out;
  out.clear();
  const next = new Map<string, string[]>();
  for (const edge of copy.edges) {
    next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to]);
    next.set(edge.to, [...(next.get(edge.to) ?? []), edge.from]);
  }
  out.set(copy.userId, 0);
  const queue = [copy.userId];
  for (let i = 0; i < queue.length; i += 1) {
    const id = queue[i]!;
    for (const other of next.get(id) ?? []) {
      if (out.has(other)) continue;
      out.set(other, out.get(id)! + 1);
      queue.push(other);
    }
  }
  return out;
}

/** Group the saved graph by handshake level (1 to 3) with nicknames applied and the "through whom" names. */
export function buildSavedModel(copy: GraphBackup): SavedModel {
  const depth = depths(copy);
  const nicknames = copy.nicknames ?? {};
  const label = new Map<string, string>();
  for (const node of copy.nodes) label.set(node.id, nicknames[node.id] || node.name);

  // Parent = a neighbour one level closer to me (the same rule the live circle uses)
  const parent = new Map<string, string>();
  for (const edge of copy.edges) {
    const a = depth.get(edge.from);
    const b = depth.get(edge.to);
    if (a === undefined || b === undefined) continue;
    if (b === a + 1 && !parent.has(edge.to)) parent.set(edge.to, edge.from);
    if (a === b + 1 && !parent.has(edge.from)) parent.set(edge.from, edge.to);
  }
  const via = (id: string): string[] => {
    const names: string[] = [];
    let cursor = parent.get(id);
    for (let guard = 0; cursor && cursor !== copy.userId && guard < 4; guard += 1) {
      names.unshift(label.get(cursor) ?? '');
      cursor = parent.get(cursor);
    }
    return names.filter(Boolean);
  };

  const levels: SavedModel['levels'] = { 1: [], 2: [], 3: [] };
  const byId = new Map<string, SavedEntry>();
  for (const node of copy.nodes) {
    const level = depth.get(node.id);
    if (node.id === copy.userId || level === undefined || level < 1 || level > 3) continue;
    const entry: SavedEntry = {
      id: node.id,
      name: label.get(node.id) ?? node.name,
      accountName: node.name,
      depth: level,
      via: level > 1 ? via(node.id) : [],
    };
    levels[level as 1 | 2 | 3].push(entry);
    byId.set(node.id, entry);
  }
  for (const list of Object.values(levels)) list.sort((a, b) => a.name.localeCompare(b.name));
  return { syncedAt: copy.syncedAt, levels, byId, total: byId.size };
}

/**
 * What the person page may keep: exactly what the server returned to the viewer (getById hides the phone and
 * getContacts returns an empty list when the viewer may not see contacts), nothing more.
 */
export function toSavedContacts(phone: string | null | undefined, contacts: ReadonlyArray<{ type: string; value: string }>): SavedContact[] {
  return [
    ...(phone && phone.trim() ? [{ type: 'phone', value: phone }] : []),
    ...contacts.filter((c) => c.value.trim()).map((c) => ({ type: c.type, value: c.value })),
  ];
}

/** Older than this, a direct connection's contacts are fetched again in the background. */
export const CONTACTS_STALE_MS = 3 * 24 * 60 * 60 * 1000;

export function isStaleContact(entry: SavedPerson | undefined): boolean {
  if (!entry) return true;
  const at = Date.parse(entry.savedAt);
  return !Number.isFinite(at) || Date.now() - at > CONTACTS_STALE_MS;
}

/** At start-up with nobody signed in, nothing of a previous session may stay on the device. */
export function sweepSavedCopy() {
  try {
    if (localStorage.getItem('accessToken')) return;
    localStorage.removeItem('so_networkStats');
  } catch {
    return;
  }
  void clearLocal().catch(() => undefined);
}
