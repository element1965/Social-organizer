import { useEffect, useMemo, useState } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';
import { scopedRetry, useAccountChangeRecovery } from './accountScope';
import { NETWORK_POLL_MS, NETWORK_STALE_MS } from '../components/circle/network';
import { isNetworkFigure, type NetworkFigure } from '../components/circle/figure';

/**
 * The saved copy of the figure: the signed-in person's last answer from the server, kept for a day so a cold
 * start (also offline) shows the numbers at once. It carries a version, the account it belongs to and the time
 * the server answered (re-reading or re-saving the copy never makes it younger), and is shown or saved only
 * when it has every field. Signing out, or in as someone else, removes it (useAuth `wipeSavedCopy`).
 */
export const FIGURE_CACHE_KEY = 'so_networkFigure';
const CACHE_VERSION = 2;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** How far in the future a saved answer time may be (small clock differences) before the copy is refused */
const CLOCK_TOLERANCE_MS = 60_000;

type Saved = { v: number; account: string; receivedAt: number; data: NetworkFigure };

/** The saved figure of this account, if it is valid and less than a day old, with when it expires. Anything else is removed. */
export function readSavedFigure(account: string | null): { data: NetworkFigure; expiresAt: number } | null {
  if (!account) return null;
  try {
    const raw = localStorage.getItem(FIGURE_CACHE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    const valid =
      saved.v === CACHE_VERSION && saved.account === account &&
      typeof saved.receivedAt === 'number' && Date.now() - saved.receivedAt <= MAX_AGE_MS &&
      // A time in the future (the clock was corrected since) is not trusted: the copy could never expire
      saved.receivedAt <= Date.now() + CLOCK_TOLERANCE_MS && isNetworkFigure(saved.data);
    if (!valid) {
      localStorage.removeItem(FIGURE_CACHE_KEY);
      return null;
    }
    return { data: saved.data as NetworkFigure, expiresAt: (saved.receivedAt as number) + MAX_AGE_MS };
  } catch {
    return null;
  }
}

function saveFigure(account: string, data: NetworkFigure, receivedAt: number): void {
  try {
    const value: Saved = { v: CACHE_VERSION, account, receivedAt, data };
    localStorage.setItem(FIGURE_CACHE_KEY, JSON.stringify(value));
  } catch {
    // storage may be unavailable (private mode); the fresh answer still applies
  }
}

/**
 * The network figure for every screen that shows it (Circle, Profile, My intention, the Need screen, the offline
 * home): one query per account, with the same key and options everywhere, so the people and the sum always come
 * as one pair from one answer. The query names the account it is for: an answer that a previous session's
 * request brings back is refused by the server and never shown or saved here. Until the first answer, after a
 * failed fetch and offline, the valid saved copy of this account stands in. `figure` is null when there is neither.
 */
export function useNetworkFigure(): { figure: NetworkFigure | null; fromSaved: boolean } {
  const account = useAuth((s) => s.userId);
  const query = trpc.stats.networkFigure.useQuery(account ? { account } : undefined, {
    enabled: !!account,
    refetchInterval: NETWORK_POLL_MS,
    staleTime: NETWORK_STALE_MS,
    retry: scopedRetry,
  });
  useAccountChangeRecovery(query.error);
  const live = account && isNetworkFigure(query.data) ? (query.data as NetworkFigure) : null;

  useEffect(() => {
    // Saved only for the account the query was asked for, and only while that account is still signed in
    if (!live || !account || useAuth.getState().userId !== account) return;
    saveFigure(account, live, query.dataUpdatedAt || Date.now());
  }, [live, account, query.dataUpdatedAt]);

  // The saved copy stands in only until it is a day old by the server's answer time: a screen that stays mounted
  // (offline) drops it when that moment passes
  const [expiredTick, setExpiredTick] = useState(0);
  const saved = useMemo(
    () => (live ? null : readSavedFigure(account)),
    [live, account, expiredTick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!saved) return;
    // Never more than a day (plus the tolerance): future answer times are refused, so this bound always holds
    const wait = Math.min(Math.max(0, saved.expiresAt - Date.now()), MAX_AGE_MS + CLOCK_TOLERANCE_MS) + 1000;
    const timer = window.setTimeout(() => setExpiredTick((n) => n + 1), wait);
    return () => window.clearTimeout(timer);
  }, [saved]);
  return live ? { figure: live, fromSaved: false } : { figure: saved?.data ?? null, fromSaved: saved != null };
}
