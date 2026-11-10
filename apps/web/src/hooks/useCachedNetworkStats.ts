import { useEffect } from 'react';
import { trpc } from '../lib/trpc';
import { NETWORK_POLL_MS, NETWORK_STALE_MS } from '../components/circle/network';

const CACHE_KEY = 'so_networkStats';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const { data, ts } = JSON.parse(raw);
    if (Date.now() - ts > MAX_AGE_MS) return undefined;
    return data;
  } catch {
    return undefined;
  }
}

/**
 * Wrapper around getNetworkStats that persists results to localStorage.
 * Shows cached data instantly, fetches fresh in background every 5 minutes
 * (useCircleNetwork refreshes it sooner when the person's own connections change).
 */
export function useCachedNetworkStats() {
  const query = trpc.connection.getNetworkStats.useQuery(undefined, {
    refetchInterval: NETWORK_POLL_MS,
    staleTime: NETWORK_STALE_MS,
    placeholderData: readCache(),
  });

  useEffect(() => {
    if (query.data && !query.isPlaceholderData) {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: query.data, ts: Date.now() }));
    }
  }, [query.data, query.isPlaceholderData]);

  return query;
}
