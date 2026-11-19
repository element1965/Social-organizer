import { createTRPCReact } from '@trpc/react-query';
import { httpBatchLink, TRPCClientError, type TRPCLink } from '@trpc/client';
import type { AppRouter } from '../../../api/src/routers/index';
import { storedAccount, useAuth } from '../hooks/useAuth';
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
/** The refresh token auth.refresh itself last refused: asking again with it cannot succeed. */
let refusedToken: string | null = null;

/**
 * The account signed in on this device right now ('' for a guest): hooks/useAuth.ts storedAccount, the same
 * stored session the auth store follows (syncAuthFromStorage). Requests are bound to it (see sessionLink).
 */
export function currentAccount(): string {
  return storedAccount();
}

/** A request made for an account that is no longer the signed-in one: dropped quietly, never told. */
function accountChanged(): DOMException {
  return new DOMException('The signed-in account changed', 'AbortError');
}

/**
 * Only auth.refresh's own answer may end a session: a tRPC error from the procedure with code UNAUTHORIZED
 * ("Invalid refresh token", apps/api auth.router). A proxy's 403 page, a rate limit, a 5xx or anything else
 * that is not that structured refusal is the network's or the server's trouble, and the session is kept.
 */
async function isRefusal(res: Response): Promise<boolean> {
  if (res.status !== 401 || !(res.headers.get('content-type') ?? '').includes('application/json')) return false;
  try {
    const body = (await res.json()) as { error?: { data?: { code?: unknown; path?: unknown } } } | null;
    const data = body?.error?.data;
    return data?.code === 'UNAUTHORIZED' && (data.path === undefined || data.path === 'auth.refresh');
  } catch {
    return false;
  }
}

/**
 * Exchange the refresh token for a new pair. One request at a time for all callers (and tabs share the result
 * through localStorage). `failedAccess`: the access token the refused request carried; when another tab or an
 * earlier renewal has already stored a newer one for the same account, that one is used without asking again.
 */
export function refreshSession(failedAccess?: string | null): Promise<Renewal> {
  const access = localStorage.getItem('accessToken');
  if (failedAccess && access && access !== failedAccess) return Promise.resolve('renewed');
  if (refreshing) return refreshing;
  refreshing = (async (): Promise<Renewal> => {
    const account = currentAccount();
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return 'rejected';
    if (refreshToken === refusedToken) return 'rejected';
    // Another tab renewed the same account while this request was out: its pair is as good as ours
    const renewedElsewhere = () => {
      const now = localStorage.getItem('refreshToken');
      return !!now && now !== refreshToken && currentAccount() === account;
    };
    try {
      const res = await trackedFetch('/trpc/auth.refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (renewedElsewhere()) return 'renewed';
      if (!res.ok) {
        if (await isRefusal(res)) {
          refusedToken = refreshToken;
          return 'rejected';
        }
        return 'unavailable';
      }
      const data = (await res.json())?.result?.data as { accessToken?: string; refreshToken?: string } | undefined;
      if (!data?.accessToken || !data.refreshToken) return 'unavailable';
      if (renewedElsewhere()) return 'renewed';
      // Signed out (or signed in as someone else) while the request was in flight: drop the result,
      // otherwise it would quietly restore a session the person just ended.
      if (localStorage.getItem('refreshToken') !== refreshToken || currentAccount() !== account) return 'rejected';
      useAuth.getState().setTokens(data.accessToken, data.refreshToken);
      return 'renewed';
    } catch {
      // Network error: keep the session, the next request tries again
      return renewedElsewhere() ? 'renewed' : 'unavailable';
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

/** The account a batch belongs to travels from the batch link to authFetch in this header; it never leaves the app. */
const ACCOUNT_HEADER = 'X-SO-Account';
/** A batch whose operations were started under different accounts belongs to none of them. */
const MIXED_ACCOUNTS = 'mixed accounts';

/** tRPC's own code for an HTTP status, for answers that did not come from tRPC (a proxy's HTML page). */
function codeForStatus(status: number): { code?: string; jsonRpc: number } {
  if (status === 401) return { code: 'UNAUTHORIZED', jsonRpc: -32001 };
  if (status === 403) return { code: 'FORBIDDEN', jsonRpc: -32003 };
  if (status === 429) return { code: 'TOO_MANY_REQUESTS', jsonRpc: -32029 };
  return { jsonRpc: -32603 };
}

/**
 * A failed answer that is not JSON (a proxy or CDN error page) would reach the app as an unparseable body
 * with its status lost. Turn it into a tRPC-shaped error that keeps the status, so a 429/401/403 is told as
 * such and anything else as a server failure.
 */
function keepStatus(res: Response): Response {
  if (res.ok || (res.headers.get('content-type') ?? '').includes('application/json')) return res;
  const { code, jsonRpc } = codeForStatus(res.status);
  const body = { error: { message: `HTTP ${res.status}`, code: jsonRpc, data: { ...(code ? { code } : {}), httpStatus: res.status } } };
  return new Response(JSON.stringify(body), { status: res.status, headers: { 'Content-Type': 'application/json' } });
}

/** Set on a batch whose operations already went through one renewal (sessionLink): no second renewal for it. */
const RENEWED_HEADER = 'X-SO-Renewed';

/**
 * The tRPC-shaped answer for a 401 that came after a renewal succeeded: the session is fine (auth.refresh just
 * issued a new pair), so the 401 is a proxy's or the server's transient trouble. It is told as "something went
 * wrong on our side", never as an ended session, and nothing is renewed again for it.
 */
const TRANSIENT_AFTER_RENEWAL = {
  error: { message: 'HTTP 401 after a successful renewal', code: -32603, data: { code: 'INTERNAL_SERVER_ERROR', httpStatus: 502 } },
};

function transientAfterRenewal(): Response {
  return new Response(JSON.stringify(TRANSIENT_AFTER_RENEWAL), { status: 502, headers: { 'Content-Type': 'application/json' } });
}

/**
 * fetch for tRPC: renews the session before it expires and retries once after a 401. The batch is bound to the
 * account its operations were started under: if another account is signed in by the time it is sent (or is
 * about to be sent again after a renewal), it is dropped as cancelled, so it never carries the other
 * account's token. A 401 means an ended session only when auth.refresh itself refused the refresh token; a
 * 401 on the replay after a successful renewal is a transient failure (see TRANSIENT_AFTER_RENEWAL).
 */
export async function authFetch(input: RequestInfo | URL, rawInit?: RequestInit): Promise<Response> {
  const headers = new Headers(rawInit?.headers);
  const owner = headers.get(ACCOUNT_HEADER);
  const alreadyRenewed = headers.get(RENEWED_HEADER) !== null;
  headers.delete(ACCOUNT_HEADER);
  headers.delete(RENEWED_HEADER);
  const init: RequestInit = { ...rawInit, headers };
  const ensureOwner = () => {
    if (owner !== null && owner !== currentAccount()) throw accountChanged();
  };
  ensureOwner();
  const token = localStorage.getItem('accessToken');
  if (token && localStorage.getItem('refreshToken')) {
    const left = secondsLeft(token);
    if (left !== null && left < 60) await refreshSession();
    ensureOwner();
  }
  const sentWith = localStorage.getItem('accessToken');
  const res = await trackedFetch(input, withAuth(init));
  if (res.status === 401 && alreadyRenewed) return transientAfterRenewal();
  if (res.status === 401 && localStorage.getItem('refreshToken')) {
    const renewal = await refreshSession(sentWith);
    ensureOwner();
    if (renewal === 'renewed') {
      const replay = await trackedFetch(input, withAuth(init));
      return replay.status === 401 ? transientAfterRenewal() : keepStatus(replay);
    }
    // The renewal itself could not be done (no network, server trouble): this is not a rejected session.
    // Fail like a network error so the 401 never reaches the sign-out path.
    if (renewal === 'unavailable') throw new TypeError('Session renewal is unavailable');
  }
  return keepStatus(res);
}

/**
 * authFetch for a direct request (an upload, an admin trigger) made by the person signed in as `account`. The
 * caller captures `currentAccount()` at the moment the person acts, before anything waits; if another account
 * is signed in by the time the request leaves or would be replayed after a renewal, it is dropped quietly
 * (AbortError, see lib/errors.ts isAborted). The token is set by authFetch, never by the caller.
 */
export function accountFetch(account: string, input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.delete('Authorization');
  headers.set(ACCOUNT_HEADER, account);
  return authFetch(input, { ...init, headers });
}

// --- Per-operation session renewal ---------------------------------------------
// A batch can answer 207 with one UNAUTHORIZED result among successful ones, so the whole-response 401 check
// above does not see it. This link looks at each operation: an UNAUTHORIZED result renews the session (one
// renewal for all callers, see refreshSession) and runs that operation once more. If the renewal could not be
// done for want of a connection, the operation fails like a network error and the session is kept; only a
// refused renewal lets UNAUTHORIZED through, which is then a real end of the session.

type Unsubscribable = { unsubscribe: () => void };
type LinkObserver = { next: (value: unknown) => void; error: (error: unknown) => void; complete: () => void };
type LinkObservable = {
  subscribe: (observer: Partial<LinkObserver>) => Unsubscribable;
  pipe: (...operators: Array<(source: LinkObservable) => LinkObservable>) => LinkObservable;
};

/** The minimal observable tRPC links exchange (subscribe + pipe), without importing @trpc/server here. */
function makeObservable(start: (observer: LinkObserver) => () => void): LinkObservable {
  const self: LinkObservable = {
    subscribe(target) {
      let closed = false;
      let teardown: (() => void) | null = null;
      const finish = () => {
        closed = true;
        teardown?.();
      };
      teardown = start({
        next: (value) => {
          if (!closed) target.next?.(value);
        },
        error: (error) => {
          if (closed) return;
          finish();
          target.error?.(error);
        },
        complete: () => {
          if (closed) return;
          finish();
          target.complete?.();
        },
      });
      if (closed) teardown();
      return { unsubscribe: finish };
    },
    pipe(...operators) {
      return operators.reduce<LinkObservable>((source, operator) => operator(source), self);
    },
  };
  return self;
}

function isUnauthorized(error: unknown): boolean {
  const data = (error as { data?: { code?: unknown } } | null)?.data;
  return data?.code === 'UNAUTHORIZED';
}

/**
 * Each operation belongs to the account signed in when it was started (or to `context.account`, which a caller
 * that acts for a known account passes, see lib/pendingSettings.ts). If another account is signed in by the
 * time it is sent, or by the time it would be sent again after a renewal, it ends as cancelled (AbortError:
 * no notice) and never carries the other account's token. The account rides along to authFetch, which checks
 * it once more when the batch actually leaves.
 */
const sessionLink: TRPCLink<AppRouter> = () => ({ op, next }) =>
  makeObservable((observer) => {
    let stopped = false;
    let current: Unsubscribable | null = null;
    const given = (op.context as { account?: unknown }).account;
    const account = typeof given === 'string' ? given : currentAccount();
    const startedWith = localStorage.getItem('accessToken');
    const bound = { ...op, context: { ...op.context, account } };
    const run = (renewed: boolean) => {
      if (currentAccount() !== account) {
        observer.error(TRPCClientError.from(accountChanged()));
        return;
      }
      const sent = renewed ? { ...bound, context: { ...bound.context, renewed: true } } : bound;
      current = (next(sent) as unknown as LinkObservable).subscribe({
        next: (value) => observer.next(value),
        complete: () => observer.complete(),
        error: (error) => {
          // Refused again right after a successful renewal: the server's or a proxy's trouble, not an ended
          // session (that is decided by auth.refresh alone). Told as a server failure; no further renewal.
          if (renewed && isUnauthorized(error)) {
            observer.error(TRPCClientError.from(TRANSIENT_AFTER_RENEWAL));
            return;
          }
          if (renewed || !isUnauthorized(error) || !localStorage.getItem('refreshToken')) {
            observer.error(error);
            return;
          }
          void refreshSession(startedWith).then((renewal) => {
            if (stopped) return;
            // Another account signed in meanwhile: this refusal belongs to the previous one; drop it quietly
            if (currentAccount() !== account) {
              observer.error(TRPCClientError.from(accountChanged()));
              return;
            }
            if (renewal === 'renewed') run(true);
            else if (renewal === 'unavailable') observer.error(TRPCClientError.from(new TypeError('Session renewal is unavailable')));
            else observer.error(error);
          });
        },
      });
    };
    run(false);
    return () => {
      stopped = true;
      current?.unsubscribe();
    };
  }) as unknown as ReturnType<ReturnType<TRPCLink<AppRouter>>>;

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      sessionLink,
      httpBatchLink({
        url: '/trpc',
        // The token itself is set by authFetch when the batch leaves; here only the batch's account is named
        headers({ opList }) {
          const accounts = new Set(opList.map((item) => {
            const account = (item.context as { account?: unknown }).account;
            return typeof account === 'string' ? account : currentAccount();
          }));
          const renewed = opList.every((item) => (item.context as { renewed?: unknown }).renewed === true);
          return {
            [ACCOUNT_HEADER]: accounts.size === 1 ? [...accounts][0]! : MIXED_ACCOUNTS,
            ...(renewed ? { [RENEWED_HEADER]: '1' } : {}),
          };
        },
        fetch: authFetch as typeof fetch,
      }),
    ],
  });
}
