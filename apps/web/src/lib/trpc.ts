import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/routers/index';
import { handleDemoRequest } from './demoData';
import { useAuth } from '../hooks/useAuth';

export const trpc = createTRPCReact<AppRouter>();

/** Minimal observable compatible with tRPC link protocol. */
function tinyObservable<T>(fn: (observer: { next: (v: T) => void; complete: () => void }) => void) {
  return {
    subscribe(observer: { next?: (v: T) => void; error?: (e: unknown) => void; complete?: () => void }) {
      fn({
        next: (v) => observer.next?.(v),
        complete: () => observer.complete?.(),
      });
      return { unsubscribe() {} };
    },
  };
}

/** tRPC link that returns mock data for demo mode (no HTTP requests). */
const demoLink = () =>
  ({ op }: { op: { path: string; input: unknown } }) =>
    tinyObservable((observer) => {
      const data = handleDemoRequest(op.path, op.input);
      observer.next({ result: { type: 'data' as const, data } });
      observer.complete();
    });

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

let refreshing: Promise<boolean> | null = null;

/** Exchange the refresh token for a new pair. One request at a time for all callers. */
export function refreshSession(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken || refreshToken === 'demo-refresh') return false;
    try {
      const res = await fetch('/trpc/auth.refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return false;
      const data = (await res.json())?.result?.data as { accessToken?: string; refreshToken?: string } | undefined;
      if (!data?.accessToken || !data.refreshToken) return false;
      // Signed out (or signed in as someone else) while the request was in flight: drop the result,
      // otherwise it would quietly restore a session the person just ended.
      if (localStorage.getItem('refreshToken') !== refreshToken) return false;
      useAuth.getState().setTokens(data.accessToken, data.refreshToken);
      return true;
    } catch {
      return false; // network error: keep the session, the next request tries again
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
  const res = await fetch(input, withAuth(init));
  if (res.status === 401 && localStorage.getItem('refreshToken') && (await refreshSession())) {
    return fetch(input, withAuth(init));
  }
  return res;
}

export function getTrpcClient() {
  const isDemo = localStorage.getItem('accessToken') === 'demo-token';

  return trpc.createClient({
    links: [
      isDemo
        ? (demoLink as never)
        : httpBatchLink({
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
