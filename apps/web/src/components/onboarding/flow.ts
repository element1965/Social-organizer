/*
 * First-run routing and safe redirects for the onboarding flow.
 *
 * "First run" is decided by the sign-in path (`isNew` from the server), not by `user.me`: new accounts are
 * created with onboardingCompleted=true on the API, so `me` cannot tell a newcomer from a rewatch.
 * The flag survives full reloads and OAuth round-trips in localStorage until the seed step is done.
 */

const FIRST_RUN_KEY = 'so.firstRun';
export const PENDING_INVITE_KEY = 'pendingInviteToken';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remember that the person who just signed in is new; cleared when the seed step finishes. */
export function markFirstRun(): void {
  try {
    storage()?.setItem(FIRST_RUN_KEY, '1');
  } catch {
    /* storage blocked: the ?first=1 in the URL still carries it */
  }
}

export function isFirstRunPending(): boolean {
  try {
    return storage()?.getItem(FIRST_RUN_KEY) === '1';
  } catch {
    return false;
  }
}

export function clearFirstRun(): void {
  try {
    storage()?.removeItem(FIRST_RUN_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * A same-origin relative path or null. Accepts only paths starting with a single "/" (no "//", "/\",
 * no scheme such as "javascript:"), and double-checks the origin with the URL parser.
 */
export function safePath(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  if (/[\u0000-\u001f]/.test(raw)) return null;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    return url.pathname + url.search + url.hash;
  } catch {
    return null;
  }
}

/** Invite tokens are ids or referral slugs. */
export function safeInviteToken(raw: string | null | undefined): string | null {
  return raw && /^[\w-]+$/.test(raw) ? raw : null;
}

export function readPendingInvite(): string | null {
  try {
    return safeInviteToken(storage()?.getItem(PENDING_INVITE_KEY));
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string | null): void {
  try {
    const s = storage();
    if (!s) return;
    if (token && safeInviteToken(token)) s.setItem(PENDING_INVITE_KEY, token);
    else s.removeItem(PENDING_INVITE_KEY);
  } catch {
    /* storage blocked */
  }
}

/** The intro for a newcomer; `next` (a safe path) is where the seed step continues to. */
export function introPath(next?: string | null): string {
  const target = safePath(next);
  return target && target !== '/' ? `/intro?first=1&next=${encodeURIComponent(target)}` : '/intro?first=1';
}

/** Where a signed-in person goes "home": the intro while a first run is pending, else the Circle. */
export function homePath(next?: string | null): string {
  return isFirstRunPending() ? introPath(next) : safePath(next) ?? '/';
}

/**
 * Where to go right after a sign-in. An invite target is opened first (the invite page sends a newcomer on to
 * the intro after accepting); any other target waits behind the intro for a new account.
 */
export function afterSignInPath(isNew: boolean, target: string | null): string {
  const safe = safePath(target);
  if (isNew) markFirstRun();
  if (safe && safe.startsWith('/invite/')) return safe;
  if (isNew) return introPath(safe);
  return safe ?? '/';
}

/** Clear demo-mode tokens; returns true when a reload was started. */
export function clearDemoSession(): boolean {
  const s = storage();
  if (s?.getItem('accessToken') !== 'demo-token') return false;
  s.removeItem('accessToken');
  s.removeItem('refreshToken');
  s.removeItem('userId');
  window.location.reload();
  return true;
}

/**
 * The masked e-mail of an existing account ("an•••@gmail.com") from the URL or the API, or null.
 * Anything else is dropped and the linking screen is shown without the address.
 */
export function safeMasked(raw: unknown): string | null {
  return typeof raw === 'string' && /^[^\s<>@]{1,3}•••@[A-Za-z0-9.-]{1,253}$/.test(raw) ? raw : null;
}
