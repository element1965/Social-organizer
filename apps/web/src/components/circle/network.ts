import { useCallback, useEffect, useMemo, useRef } from 'react';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../hooks/useAuth';
import { announceJoin, JOIN_MAX_MS, sliceSize, useJoining } from './joining';

export type NetPerson = {
  id: string;
  /** Circle label (my nickname for a direct connection) or the account name. */
  name: string;
  accountName: string;
  photoUrl: string | null;
  depth: number;
  connectionCount: number;
  lastSeen: string | Date | null;
};

type SliceNode = {
  id: string;
  name: string;
  photoUrl: string | null;
  depth: number;
  connectionCount: number;
  lastSeen: string | Date | null;
};

/** How often the heavy network queries are re-read on a timer, and how long a fresh answer is reused. */
export const NETWORK_POLL_MS = 5 * 60_000;
export const NETWORK_STALE_MS = 60_000;

/**
 * Graph slice (3 rings) with nicknames applied and a parent for every node, so the UI can say
 * "through whom" and highlight a path without another request.
 */
export function useCircleNetwork() {
  const myId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  // The lists of people are heavy, so they are re-read every 5 minutes; the cheap count of the person's own
  // connections is re-read whenever the app-wide pulse (hooks/usePulse.ts) sees it change, and a change in it
  // is how a join made on the other phone shows up here: it refreshes the heavy lists at once.
  const slice = trpc.connection.graphSlice.useQuery(undefined, { refetchInterval: NETWORK_POLL_MS, staleTime: NETWORK_STALE_MS });
  const connections = trpc.connection.list.useQuery(undefined, { refetchInterval: NETWORK_POLL_MS, staleTime: NETWORK_STALE_MS });
  const count = trpc.connection.getCount.useQuery();
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    const now = count.data?.count;
    if (now === undefined) return;
    if (lastCount.current !== null && now > lastCount.current && !useJoining.getState().person) {
      // Someone joined from the other side (they scanned my code or accepted my request): the same
      // "joining" state as for a join made here. It also starts the slice load.
      void announceJoin(utils, undefined, sliceSize(utils));
    }
    if (lastCount.current !== null && lastCount.current !== now) {
      void utils.connection.graphSlice.invalidate();
      void utils.connection.list.invalidate();
      void utils.connection.getNetworkStats.invalidate();
      void utils.stats.networkCapabilities.invalidate();
    }
    lastCount.current = now;
  }, [count.data?.count, utils]);

  const nicknames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connections.data ?? []) if (c.nickname) map.set(c.userId, c.nickname);
    return map;
  }, [connections.data]);

  // A connection made a moment ago: drawn at once on the first ring, before the slice with their network is back.
  const joined = useJoining((s) => s.person);
  const joinedSince = useJoining((s) => s.since);
  const clearJoin = useJoining((s) => s.clear);
  const me = trpc.user.me.useQuery(undefined, { enabled: joined != null });
  const sliceFresh = slice.isSuccess && slice.dataUpdatedAt >= joinedSince && !slice.isFetching;
  const joinedLoaded = joined != null && sliceFresh;
  const joinedBefore = useJoining((s) => s.before);
  useEffect(() => {
    if (!joined) return;
    const left = JOIN_MAX_MS - (Date.now() - joinedSince);
    const timer = window.setTimeout(clearJoin, Math.max(0, left));
    return () => window.clearTimeout(timer);
  }, [joined, joinedSince, clearJoin]);

  const model = useMemo(() => {
    const people = new Map<string, NetPerson>();
    const parent = new Map<string, string>();
    let nodes = (slice.data?.nodes ?? []) as SliceNode[];
    let edges = slice.data?.edges ?? [];
    if (joined && myId && !nodes.some((n) => n.id === joined.id)) {
      const extra: SliceNode[] = [];
      if (!nodes.some((n) => n.id === myId)) {
        extra.push({ id: myId, name: me.data?.name ?? '', photoUrl: me.data?.photoUrl ?? null, depth: 0, connectionCount: 1, lastSeen: null });
      }
      extra.push({ id: joined.id, name: joined.name, photoUrl: joined.photoUrl, depth: 1, connectionCount: 1, lastSeen: null });
      nodes = [...nodes, ...extra];
      edges = [...edges, { from: myId, to: joined.id }];
    }
    for (const n of nodes) {
      const depth = n.id === myId ? 0 : n.depth;
      people.set(n.id, {
        id: n.id,
        name: nicknames.get(n.id) || n.name,
        accountName: n.name,
        photoUrl: n.photoUrl,
        depth,
        connectionCount: n.connectionCount ?? 0,
        lastSeen: n.lastSeen ?? null,
      });
    }
    // Parent = a neighbour one ring closer to me. The slice is built from BFS paths, so one exists.
    for (const e of edges) {
      const a = people.get(e.from);
      const b = people.get(e.to);
      if (!a || !b) continue;
      if (b.depth === a.depth + 1 && !parent.has(b.id)) parent.set(b.id, a.id);
      if (a.depth === b.depth + 1 && !parent.has(a.id)) parent.set(a.id, b.id);
    }
    return { people, parent, nodes, edges };
  }, [slice.data, nicknames, myId, joined, me.data?.name, me.data?.photoUrl]);

  /** Ids from me to the person, inclusive. Empty when the person is not in the slice. */
  const pathTo = useCallback(
    (id: string): string[] => {
      if (!model.people.has(id)) return [];
      const out: string[] = [];
      let cursor: string | undefined = id;
      let guard = 0;
      while (cursor && guard < 8) {
        out.unshift(cursor);
        if (cursor === myId) return out;
        cursor = model.parent.get(cursor);
        guard += 1;
      }
      return myId && out[0] !== myId ? [myId, ...out] : out;
    },
    [model, myId],
  );

  /** Names between me and the person ("Oleg brother → Ira"). */
  const viaNames = useCallback(
    (id: string): string[] =>
      pathTo(id)
        .slice(1, -1)
        .map((pid) => model.people.get(pid)?.name ?? '')
        .filter(Boolean),
    [model, pathTo],
  );

  const displayName = useCallback(
    (id: string, fallback: string) => nicknames.get(id) || model.people.get(id)?.name || fallback,
    [nicknames, model],
  );

  return {
    myId,
    slice,
    connections,
    people: model.people,
    nodes: model.nodes,
    edges: model.edges,
    pathTo,
    viaNames,
    displayName,
    /** The person who just joined, while the Circle tells about it; `loaded` once their network is in the slice. */
    joining: joined
      ? {
          person: { ...joined, name: nicknames.get(joined.id) || joined.name },
          loaded: joinedLoaded,
          // People who came with them: the slice grew by more than me and the person themselves
          added: joinedLoaded
            ? Math.max(0, (slice.data?.nodes.length ?? 0) - Math.max(1, joinedBefore) - 1)
            : 0,
        }
      : null,
    clearJoining: clearJoin,
  };
}

export type CircleNetwork = ReturnType<typeof useCircleNetwork>;
