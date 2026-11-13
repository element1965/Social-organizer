import { Prisma, type PrismaClient } from '@so/db';
import { getGraph } from './graph-cache.service.js';
import { VISIBLE_RINGS } from './network.service.js';

/**
 * One page of the people at one handshake (1–3) from a person, for the People lists.
 *
 * Who is in the ring and the path to each of them come from the graph in memory. The database is read
 * for the page only (names, photos, intentions), except when the order or a search needs the names or
 * intentions of the whole ring: then one query takes the ring's ids as an array, joins them to users by
 * primary key, sorts and cuts the page there (LIMIT/OFFSET), and counts the matches in the same pass.
 * Nothing beyond the 3rd ring is ever read here.
 */

export const RING_SORTS = ['recent', 'name', 'intention', 'brought'] as const;
export type RingSort = (typeof RING_SORTS)[number];

export interface RingPerson {
  id: string;
  name: string;
  photoUrl: string | null;
  remainingBudget: number | null;
  createdAt: Date | null;
  /** The newest connection on the way to them (for the 1st ring: when you connected) */
  connectedAt: Date | null;
  /** Their own direct connections */
  connectionCount: number;
  /** People between the root and them, nearest to the root first (empty on the 1st ring) */
  via: Array<{ id: string; name: string }>;
}

export interface RingPage {
  people: RingPerson[];
  /** People in the ring, or the matches when there is a search */
  total: number;
  /** Offset of the next page; null when this was the last one */
  nextCursor: number | null;
}

export interface RingQuery {
  ring: 1 | 2 | 3;
  cursor?: number;
  limit: number;
  search?: string;
  sort: RingSort;
}

/** The people of one ring as columns, read while the walk's arrays are valid. */
interface RingColumns {
  ids: string[];
  /** Newest connection time on the path (ms) */
  at: number[];
  /** Direct connections each has */
  degree: number[];
  /** The 1st-ring and 2nd-ring person on the path ('' when the ring is nearer) */
  via1: string[];
  via2: string[];
}

function collectRing(graph: Awaited<ReturnType<typeof getGraph>>, root: number, ring: number): RingColumns {
  const out: RingColumns = { ids: [], at: [], degree: [], via1: [], via2: [] };
  // A pooled walk: parent/newestAt are read inside the loop, before the walk gives its arrays back
  for (const step of graph.rings(root, Math.min(ring, VISIBLE_RINGS), true)) {
    if (step.depth !== ring) continue;
    const { parent, newestAt } = step;
    for (const n of step.people) {
      out.ids.push(graph.ids[n]!);
      out.at.push(newestAt[n]!);
      out.degree.push(graph.degree(n));
      if (ring === 1) {
        out.via1.push('');
        out.via2.push('');
      } else if (ring === 2) {
        out.via1.push(graph.ids[parent[n]!]!);
        out.via2.push('');
      } else {
        const p = parent[n]!;
        out.via2.push(graph.ids[p]!);
        out.via1.push(graph.ids[parent[p]!]!);
      }
    }
  }
  return out;
}

/** `%`, `_` and `\` typed by a person are literal characters in the search, not patterns. */
function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function ringPeople(db: PrismaClient, rootId: string, query: RingQuery): Promise<RingPage> {
  const graph = await getGraph(db);
  const root = graph.find(rootId);
  if (root === undefined) return { people: [], total: 0, nextCursor: null };
  const cols = collectRing(graph, root, query.ring);
  const offset = Math.max(0, query.cursor ?? 0);
  const limit = query.limit;
  const search = query.search?.trim() ?? '';
  // "Brought in" is known on the 1st ring only; elsewhere the default order applies
  const sort: RingSort = query.sort === 'brought' && query.ring !== 1 ? 'recent' : query.sort;

  const index = new Map<string, number>();
  cols.ids.forEach((id, i) => index.set(id, i));

  let pageIds: string[];
  let total: number;
  if (sort === 'recent' && !search) {
    // Everything the order needs is in memory: no query over the ring
    const order = cols.ids.map((_, i) => i);
    order.sort((a, b) => cols.at[b]! - cols.at[a]! || (cols.ids[a]! < cols.ids[b]! ? -1 : 1));
    pageIds = order.slice(offset, offset + limit).map((i) => cols.ids[i]!);
    total = cols.ids.length;
  } else if (cols.ids.length === 0) {
    pageIds = [];
    total = 0;
  } else {
    // One query over the whole ring: the ids (and the in-memory keys) go in as arrays
    const brought = cols.degree.map((d) => Math.max(0, d - 1));
    const where = search ? Prisma.sql`AND u.name ILIKE ${likePattern(search)}` : Prisma.empty;
    const orderBy =
      sort === 'name'
        ? Prisma.sql`lower(u.name), u.id`
        : sort === 'intention'
          ? Prisma.sql`COALESCE(u."remainingBudget", 0) DESC, lower(u.name), u.id`
          : sort === 'brought'
            ? Prisma.sql`r.brought DESC, lower(u.name), u.id`
            : Prisma.sql`r.at DESC, u.id`;
    const rows = await db.$queryRaw<Array<{ id: string; total: bigint }>>`
      SELECT u.id, COUNT(*) OVER () AS total
      FROM unnest(${cols.ids}::text[], ${cols.at}::float8[], ${brought}::int[]) AS r(id, at, brought)
      JOIN users u ON u.id = r.id
      WHERE u."deletedAt" IS NULL ${where}
      ORDER BY ${orderBy}
      LIMIT ${limit} OFFSET ${offset}
    `;
    pageIds = rows.map((r) => r.id);
    if (rows.length > 0) total = Number(rows[0]!.total);
    else if (offset === 0) total = 0;
    else {
      // Past the end: count separately so the answer still says how many there are
      const [row] = await db.$queryRaw<Array<{ total: bigint }>>`
        SELECT COUNT(*) AS total
        FROM unnest(${cols.ids}::text[]) AS r(id)
        JOIN users u ON u.id = r.id
        WHERE u."deletedAt" IS NULL ${where}
      `;
      total = Number(row?.total ?? 0);
    }
  }

  // The page only: its people and the people on their paths
  const viaIds = new Set<string>();
  for (const id of pageIds) {
    const i = index.get(id)!;
    if (cols.via1[i]) viaIds.add(cols.via1[i]!);
    if (cols.via2[i]) viaIds.add(cols.via2[i]!);
  }
  const users = await db.user.findMany({
    where: { id: { in: [...pageIds, ...viaIds] }, deletedAt: null },
    select: { id: true, name: true, photoUrl: true, remainingBudget: true, createdAt: true },
  });
  const byId = new Map(users.map((u) => [u.id, u]));

  const people: RingPerson[] = [];
  for (const id of pageIds) {
    const user = byId.get(id);
    if (!user) continue; // deleted after the graph was read
    const i = index.get(id)!;
    const via: RingPerson['via'] = [];
    for (const v of [cols.via1[i]!, cols.via2[i]!]) {
      if (!v) continue;
      const person = byId.get(v);
      if (person) via.push({ id: v, name: person.name });
    }
    people.push({
      id,
      name: user.name,
      photoUrl: user.photoUrl,
      remainingBudget: user.remainingBudget,
      createdAt: user.createdAt,
      connectedAt: cols.at[i]! > 0 ? new Date(cols.at[i]!) : null,
      connectionCount: cols.degree[i]!,
      via,
    });
  }
  const next = offset + pageIds.length;
  return { people, total, nextCursor: pageIds.length === limit && next < total ? next : null };
}
