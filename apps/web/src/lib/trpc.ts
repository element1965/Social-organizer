import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/routers/index';
import { useAuth } from '../hooks/useAuth';
import { isNetworkFailure, reportReachable, reportUnreachable } from './connectivity';

export const trpc = createTRPCReact<AppRouter>();

// --- Session renewal -------------------------------------------------------
// The server accepts an access token for 30 minutes (SO-14 checks expiry). Before this the app never
// renewed it, so every web/app user was signed out after 30 minutes. Renew with the refresh token:
// ahead of time when the token is about to expire, and once more if the server still answers 401.

/** Seconds until the token expires (negative if expired); null if it cannot be read. */
function secondsLeft(token: string): number | null {
  try {
    const body = token.split('.')[1];
    if (!body) return null;
    const json = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json.exp === 'number' ? json.exp - Math.floor(Date.now() / 1000) : null;
  } catch {
    return null;
  }
}

/** fetch that tells the connectivity state whether the server answered at all (any HTTP status counts as an answer). */
async function trackedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  try {
    const res = await fetch(input, init);
    reportReachable();
    return res;
  } catch (error) {
    if (isNetworkFailure(error)) reportUnreachable();
    throw error;
  }
}

/**
 * renewed: a new pair is stored. rejected: the server refused the refresh token (the session is really over).
 * unavailable: no answer or a server-side failure (offline, outage): the session must be kept.
 */
export type Renewal = 'renewed' | 'rejected' | 'unavailable';

let refreshing: Promise<Renewal> | null = null;

/** Exchange the refresh token for a new pair. One request at a time for all callers. */
export function refreshSession(): Promise<Renewal> {
  if (refreshing) return refreshing;
  refreshing = (async (): Promise<Renewal> => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return 'rejected';
    try {
      const res = await trackedFetch('/trpc/auth.refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) {
        // Only a client error means "this token is not accepted". 5xx, 408 and 429 are the server's trouble.
        const refused = res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429;
        return refused ? 'rejected' : 'unavailable';
      }
      const data = (await res.json())?.result?.data as { accessToken?: string; refreshToken?: string } | undefined;
      if (!data?.accessToken || !data.refreshToken) return 'unavailable';
      // Signed out (or signed in as someone else) while the request was in flight: drop the result,
      // otherwise it would quietly restore a session the person just ended.
      if (localStorage.getItem('refreshToken') !== refreshToken) return 'rejected';
      useAuth.getState().setTokens(data.accessToken, data.refreshToken);
      return 'renewed';
    } catch {
      return 'unavailable'; // network error: keep the session, the next request tries again
    } finally {
      setTimeout(() => { refreshing = null; }, 0);
    }
  })();
  return refreshing;
}

function withAuth(init: RequestInit | undefined): RequestInit {
  const headers = new Headers(init?.headers);
  const token = localStorage.getItem('accessToken');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else headers.delete('Authorization');
  return { ...init, headers };
}

/** fetch for tRPC: renews the session before it expires and retries once after a 401. */
export async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const token = localStorage.getItem('accessToken');
  if (token && localStorage.getItem('refreshToken')) {
    const left = secondsLeft(token);
    if (left !== null && left < 60) await refreshSession();
  }
  const res = await trackedFetch(input, withAuth(init));
  if (res.status === 401 && localStorage.getItem('refreshToken')) {
    const renewal = await refreshSession();
    if (renewal === 'renewed') return trackedFetch(input, withAuth(init));
    // The renewal itself could not be done (no network, server trouble): this is not a rejected session.
    // Fail like a network error so the 401 never reaches the sign-out path.
    if (renewal === 'unavailable') throw new TypeError('Session renewal is unavailable');
  }
  return res;
}

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: '/trpc',
        headers() {
          const token = localStorage.getItem('accessToken');
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
        fetch: authFetch as typeof fetch,
      }),
    ],
  });
}
