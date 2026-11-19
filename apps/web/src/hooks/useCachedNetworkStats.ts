import { useEffect, useMemo } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';
import { scopedRetry, useAccountChangeRecovery } from './accountScope';
import { NETWORK_POLL_MS, NETWORK_STALE_MS } from '../components/circle/network';

/**
 * The saved copy carries a version and the account it belongs to, and is shown or saved only with every field
 * the screens read, down to each person in the ring lists: a payload from an older server or app (other fields,
 * another meaning of the network numbers) or a damaged one is neither shown nor kept. The network figure itself
 * is not read from here: screens take it from useNetworkFigure.
 */
const CACHE_KEY = 'so_networkStats';
const CACHE_VERSION = 3;
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isCount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isTime = (v: unknown) => v == null || typeof v === 'string' || v instanceof Date;

/** A person in a ring list, as the People screen reads them (PeoplePage `DepthUser`) */
function isRingPerson(v: unknown): boolean {
  if (!isObject(v)) return false;
  return (
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.name === 'string' &&
    (v.photoUrl == null || typeof v.photoUrl === 'string') &&
    isTime(v.connectedAt) && isTime(v.createdAt) &&
    (v.remainingBudget == null || typeof v.remainingBudget === 'number') &&
    (v.via === undefined || (Array.isArray(v.via) && v.via.every((p) => isObject(p) && typeof p.id === 'string' && typeof p.name === 'string')))
  );
}

function isStats(data: unknown): boolean {
  if (!isObject(data)) return false;
  const { byDepth, usersByDepth, farRings } = data;
  if (!isObject(byDepth) || !isObject(usersByDepth) || !isObject(farRings)) return false;
  if (!isCount(data.networkPeople) || !isCount(data.networkCanHelp)) return false;
  if (!Object.entries(byDepth).every(([ring, n]) => ['1', '2', '3'].includes(ring) && isCount(n))) return false;
  if (!isCount(farRings.count) || typeof farRings.few !== 'boolean') return false;
  // Every ring list is an array of whole person entries, and never longer than the ring's own count
  return Object.entries(usersByDepth).every(
    ([ring, list]) => ['1', '2', '3'].includes(ring) && Array.isArray(list) && list.every(isRingPerson) &&
      list.length <= Number(byDepth[ring] ?? 0),
  );
}

function readCache(account: string | null) {
  if (!account) return undefined;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return undefined;
    const { data, ts, v, account: owner } = JSON.parse(raw);
    if (v !== CACHE_VERSION || owner !== account || typeof ts !== 'number' || Date.now() - ts > MAX_AGE_MS || !isStats(data)) {
      localStorage.removeItem(CACHE_KEY);
      return undefined;
    }
    return data;
  } catch {
    return undefined;
  }
}

/**
 * Wrapper around getNetworkStats that persists results to localStorage, per account (the query names the
 * account it is for, so an answer for a previous session is refused by the server and never shown or saved).
 * Shows cached data instantly, fetches fresh in background every 5 minutes
 * (useCircleNetwork refreshes it sooner when the person's own connections change).
 */
export function useCachedNetworkStats() {
  const account = useAuth((s) => s.userId);
  const placeholder = useMemo(() => readCache(account), [account]);
  const query = trpc.connection.getNetworkStats.useQuery(account ? { account } : undefined, {
    enabled: !!account,
    refetchInterval: NETWORK_POLL_MS,
    staleTime: NETWORK_STALE_MS,
    placeholderData: placeholder,
    retry: scopedRetry,
  });
  useAccountChangeRecovery(query.error);

  useEffect(() => {
    if (!account || !query.data || query.isPlaceholderData || !isStats(query.data)) return;
    if (useAuth.getState().userId !== account) return;
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({ data: query.data, ts: query.dataUpdatedAt || Date.now(), v: CACHE_VERSION, account }));
    } catch {
      // storage may be unavailable (private mode); the fresh answer still applies
    }
  }, [account, query.data, query.dataUpdatedAt, query.isPlaceholderData]);

  // React Query drops placeholder data once a fetch fails: offline, the valid saved copy stays the data
  return { ...query, data: query.data ?? placeholder };
}
