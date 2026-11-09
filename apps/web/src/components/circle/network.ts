import { useCallback, useMemo } from 'react';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../hooks/useAuth';

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

/**
 * Graph slice (3 rings) with nicknames applied and a parent for every node, so the UI can say
 * "through whom" and highlight a path without another request.
 */
export function useCircleNetwork() {
  const myId = useAuth((s) => s.userId);
  const slice = trpc.connection.graphSlice.useQuery(undefined, { refetchInterval: 60_000 });
  const connections = trpc.connection.list.useQuery(undefined, { refetchInterval: 60_000 });

  const nicknames = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of connections.data ?? []) if (c.nickname) map.set(c.userId, c.nickname);
    return map;
  }, [connections.data]);

  const model = useMemo(() => {
    const people = new Map<string, NetPerson>();
    const parent = new Map<string, string>();
    const nodes = (slice.data?.nodes ?? []) as SliceNode[];
    const edges = slice.data?.edges ?? [];
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
  }, [slice.data, nicknames, myId]);

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
  };
}

export type CircleNetwork = ReturnType<typeof useCircleNetwork>;
