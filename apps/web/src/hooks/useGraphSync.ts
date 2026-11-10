import { useEffect, useRef } from 'react';
import { initGunBackup, readContacts, retainContacts, saveContacts, syncToLocal } from '@so/gun-backup';
import { trpc } from '../lib/trpc';
import { isOffline } from '../lib/connectivity';
import { isStaleContact, toSavedContacts } from '../lib/savedCopy';
import { useAuth } from './useAuth';

let gunInitialized = false;

/** Direct connections whose contacts are refreshed per sync cycle (one batched HTTP request, two calls each). */
const CONTACTS_PER_CYCLE = 15;
/** The saved copy is rewritten at least this often even when nothing changed, so "saved <time>" stays honest. */
const RESAVE_MS = 60 * 60 * 1000;

function fingerprint(
  userId: string,
  nodes: Array<{ id: string; name: string; depth?: number }>,
  edges: Array<{ from: string; to: string }>,
  nicknames: Record<string, string>,
): string {
  // Photo URLs are left out on purpose: one can be a very large data URL
  let h = 5381;
  const feed = (text: string) => {
    for (let i = 0; i < text.length; i += 1) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  };
  feed(userId);
  for (const n of nodes) {
    feed(n.id);
    feed(n.name);
    feed(String(n.depth ?? ''));
  }
  for (const e of edges) {
    feed(e.from);
    feed(e.to);
  }
  for (const [id, nick] of Object.entries(nicknames)) {
    feed(id);
    feed(nick);
  }
  return `${nodes.length}:${edges.length}:${h}`;
}

/**
 * Periodically syncs the user's network graph (3 levels) to local Gun.js / IndexedDB backup.
 * Gun.js relay on the server syncs data between clients, creating cross-redundancy:
 * each user's contacts also store their graph, so the network survives server loss.
 *
 * The IndexedDB copy is what the app shows without a connection, so the same cycle also keeps
 * nicknames and the contacts of direct connections (see `lib/savedCopy.ts`).
 */
export function useGraphSync() {
  const userId = useAuth((s) => s.userId);
  const savedRef = useRef<{ key: string; at: number } | null>(null);
  const savingRef = useRef<string | null>(null);
  const utils = trpc.useUtils();

  // Fetch full graph (3 levels depth) every 5 minutes
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    refetchInterval: 300_000,
    enabled: !!userId,
  });
  // Direct connections: nicknames for the saved copy and the list of people whose contacts are kept
  const { data: connections, dataUpdatedAt: connectionsAt, isError: connectionsFailed } = trpc.connection.list.useQuery(undefined, {
    refetchInterval: 300_000,
    enabled: !!userId,
  });

  // Initialize Gun.js once with relay server URL (after sign-in: the relay requires a token)
  useEffect(() => {
    if (gunInitialized || !userId) return;
    gunInitialized = true;

    // Derive relay URL from current origin (same server hosts the relay)
    const proto = location.protocol === 'https:' ? 'https:' : 'http:';
    const relayUrl = `${proto}//${location.host}/gun`;

    initGunBackup([relayUrl], () => localStorage.getItem('accessToken')).catch(() => {});
  }, [userId]);

  // Sync graph to local backup when data changes (or once an hour)
  useEffect(() => {
    if (!graphData || !userId) return;
    // Wait for the list of direct connections (nicknames), but when it failed save the graph without them
    if (!connections && !connectionsFailed) return;

    const nicknames: Record<string, string> = {};
    for (const c of connections ?? []) if (c.nickname) nicknames[c.userId] = c.nickname;
    const key = fingerprint(userId, graphData.nodes, graphData.edges, nicknames);
    const last = savedRef.current;
    if (last && last.key === key && Date.now() - last.at < RESAVE_MS) return;
    if (savingRef.current === key) return;
    savingRef.current = key;

    // Marked as saved only after the write committed, so a failed or refused write is tried again
    syncToLocal({
      userId,
      nodes: graphData.nodes,
      edges: graphData.edges,
      syncedAt: new Date().toISOString(),
      ...(connections ? { nicknames } : {}),
    })
      .then((saved) => {
        if (saved) savedRef.current = { key, at: Date.now() };
      })
      .catch(() => {})
      .finally(() => {
        savingRef.current = null;
      });
  }, [graphData, connections, connectionsFailed, userId]);

  // Keep the contacts of direct connections. There is no list endpoint for contacts, so each person is read with
  // the same two calls the person page makes (the server applies the same visibility rules); the calls of one
  // cycle travel in one batched request, a few people per cycle, only those missing or older than three days.
  // Person pages also save what they load (pages/PersonPage.tsx).
  useEffect(() => {
    if (!userId || !connections || isOffline()) return;
    let cancelled = false;
    const direct = connections.map((c) => c.userId);
    void (async () => {
      await retainContacts(userId, direct);
      const saved = await readContacts(userId);
      const due = direct.filter((id) => isStaleContact(saved[id])).slice(0, CONTACTS_PER_CYCLE);
      await Promise.all(
        due.map(async (id) => {
          try {
            const [person, contacts] = await Promise.all([
              utils.client.user.getById.query({ userId: id }),
              utils.client.user.getContacts.query({ userId: id }),
            ]);
            if (!cancelled) await saveContacts(userId, id, toSavedContacts(person.phone, contacts));
          } catch {
            /* the next cycle tries again */
          }
        }),
      );
    })().catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // connectionsAt: once per fetch of the list (every 5 minutes), not on every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectionsAt, userId]);
}
