import { useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

let gunInitialized = false;

/**
 * Periodically syncs the user's network graph (3 levels) to local Gun.js / IndexedDB backup.
 * Gun.js relay on the server syncs data between clients, creating cross-redundancy:
 * each user's contacts also store their graph, so the network survives server loss.
 */
export function useGraphSync() {
  const userId = useAuth((s) => s.userId);
  const syncedRef = useRef<string | null>(null);

  // Fetch full graph (3 levels depth) every 5 minutes
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    refetchInterval: 300_000,
    enabled: !!userId,
  });

  // Initialize Gun.js once with relay server URL
  useEffect(() => {
    if (gunInitialized) return;
    gunInitialized = true;

    // Derive relay URL from current origin (same server hosts the relay)
    const proto = location.protocol === 'https:' ? 'https:' : 'http:';
    const relayUrl = `${proto}//${location.host}/gun`;

    import('@so/gun-backup').then((m) => m.initGunBackup([relayUrl])).catch(() => {});
  }, []);

  // Sync graph to local backup when data changes
  useEffect(() => {
    if (!graphData || !userId) return;

    const fingerprint = `${graphData.nodes.length}:${graphData.edges.length}`;
    if (syncedRef.current === fingerprint) return;
    syncedRef.current = fingerprint;

    import('@so/gun-backup').then((m) =>
      m.syncToLocal({
        userId,
        nodes: graphData.nodes,
        edges: graphData.edges,
        syncedAt: new Date().toISOString(),
      }),
    ).catch(() => {});
  }, [graphData, userId]);
}
