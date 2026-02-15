import { useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

let gunInitialized = false;

/**
 * Periodically syncs the user's network graph to local Gun.js / IndexedDB backup.
 * Runs every 5 minutes for authenticated users.
 * The backup stores 2 levels of depth so the network can be restored if the server goes down.
 */
export function useGraphSync() {
  const userId = useAuth((s) => s.userId);
  const syncedRef = useRef<string | null>(null);

  // Fetch graph data independently, every 5 minutes
  const { data: graphData } = trpc.connection.graphSlice.useQuery(undefined, {
    refetchInterval: 300_000,
    enabled: !!userId,
  });

  // Initialize Gun.js once
  useEffect(() => {
    if (gunInitialized) return;
    gunInitialized = true;
    import('@so/gun-backup').then((m) => m.initGunBackup([])).catch(() => {});
  }, []);

  // Sync graph data to local backup when it changes
  useEffect(() => {
    if (!graphData || !userId) return;

    // Skip if data hasn't changed (simple check by node count + edge count)
    const fingerprint = `${graphData.nodes.length}:${graphData.edges.length}`;
    if (syncedRef.current === fingerprint) return;
    syncedRef.current = fingerprint;

    // Build depth-1 connections (direct edges from me)
    const myEdges = graphData.edges.filter(
      (e) => e.from === userId || e.to === userId,
    );
    const directIds = new Set(
      myEdges.map((e) => (e.from === userId ? e.to : e.from)),
    );

    const nodeMap = new Map(graphData.nodes.map((n) => [n.id, n]));

    const connections = [...directIds].map((id) => {
      const node = nodeMap.get(id);
      return {
        userId: id,
        name: node?.name ?? 'Unknown',
        photoUrl: node?.photoUrl ?? null,
        connectedAt: '',
      };
    });

    // Build level-2: for each direct connection, find their other connections
    const level2: Record<string, Array<{ userId: string; name: string; photoUrl: string | null; connectedAt: string }>> = {};
    for (const connId of directIds) {
      const theirEdges = graphData.edges.filter(
        (e) =>
          (e.from === connId || e.to === connId) &&
          e.from !== userId &&
          e.to !== userId,
      );
      level2[connId] = theirEdges.map((e) => {
        const otherId = e.from === connId ? e.to : e.from;
        const node = nodeMap.get(otherId);
        return {
          userId: otherId,
          name: node?.name ?? 'Unknown',
          photoUrl: node?.photoUrl ?? null,
          connectedAt: '',
        };
      });
    }

    import('@so/gun-backup').then((m) =>
      m.syncToLocal({
        userId,
        connections,
        level2,
        syncedAt: new Date().toISOString(),
      }),
    ).catch(() => {});
  }, [graphData, userId]);
}
