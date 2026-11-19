/*
 * First-run routing and safe redirects for the onboarding flow.
 *
 * "First run" is decided by the sign-in path (`isNew` from the server), not by `user.me`: new accounts are
 * created with onboardingCompleted=true on the API, so `me` cannot tell a newcomer from a rewatch.
 * The flag survives full reloads and OAuth round-trips in localStorage until the first run ends: the name step
 * after the intro (namePath with `end`).
 */

const PENDING_SOS_KEY = 'pendingSosCollection';
export const PENDING_INVITE_KEY = 'pendingInviteToken';

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Remember that the person who just signed in is new; cleared when the seed step finishes. */
export function markFirstRun(userId: string): void {
  try {
    storage()?.setItem(`so.firstRun:${userId}`, '1');
  } catch {
    /* storage blocked: the ?first=1 in the URL still carries it */
  }
}

export function isFirstRunPending(userId: string | null): boolean {
  try {
    return !!userId && storage()?.getItem(`so.firstRun:${userId}`) === '1';
  } catch {
    return false;
  }
}

export function clearFirstRun(userId: string | null): void {
  try {
    if (userId) storage()?.removeItem(`so.firstRun:${userId}`);
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

/**
 * A code typed by hand (SO-24 п.1): the bare code, a personal address (/i/anna) or a whole invite link pasted
 * from a message. Returns the code the invite page understands, or null.
 */
export function inviteCodeFromInput(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/(?:\/invite\/|\/i\/|[?&]invite=)([\w-]+)/);
  return safeInviteToken(m ? m[1] : s);
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

/** The intro for a newcomer; `next` (a safe path) is where the name step continues to. */
export function introPath(next?: string | null): string {
  const target = safePath(next);
  return target && target !== '/' ? `/intro?first=1&next=${encodeURIComponent(target)}` : '/intro?first=1';
}

/**
 * The name step of a first run (/seed): asked only when the account has no real name yet (an e-mail sign-up),
 * otherwise it passes straight on to `next`. `end` closes the first run there (after the intro); without it the
 * first run stays pending, so a newcomer who came for a Need is still offered the intro after taking part.
 */
export function namePath(next?: string | null, end = false): string {
  const target = safePath(next);
  const query = new URLSearchParams({ first: '1' });
  if (end) query.set('end', '1');
  if (target && target !== '/') query.set('next', target);
  return `/seed?${query.toString()}`;
}

/** Where a signed-in person goes "home": the intro while a first run is pending, else the Circle. */
export function homePath(userId: string | null, next?: string | null): string {
  return isFirstRunPending(userId) ? introPath(next) : safePath(next) ?? '/';
}

/** In-app path that opens a Need and connects the viewer to its author. */
export function sosCollectionPath(collectionId: string): string {
  return `/collection/${encodeURIComponent(collectionId)}?sos=true`;
}

export function sosIdFromPath(path: string | null): string | null {
  if (!path) return null;
  const [pathname, search] = path.split(/[?#]/, 2);
  const id = pathname?.match(/^\/collection\/([\w-]+)$/)?.[1];
  return id && new URLSearchParams(search).get('sos') === 'true' ? id : null;
}

export function savePendingSos(collectionId: string | null): void {
  try {
    const s = storage();
    if (collectionId && safeInviteToken(collectionId)) s?.setItem(PENDING_SOS_KEY, collectionId);
    else s?.removeItem(PENDING_SOS_KEY);
  } catch {
    /* storage blocked */
  }
}

function takePendingSosPath(): string | null {
  try {
    const s = storage();
    const collectionId = safeInviteToken(s?.getItem(PENDING_SOS_KEY));
    s?.removeItem(PENDING_SOS_KEY);
    return collectionId ? sosCollectionPath(collectionId) : null;
  } catch {
    return null;
  }
}

export function telegramStartPath(startParam: string | null): string | null {
  const match = startParam?.match(/^(sos|collection|invite)_([\w-]+)$/);
  const id = match?.[2];
  if (!id) return null;
  if (match[1] === 'sos') return sosCollectionPath(id);
  if (match[1] === 'invite') return `/invite/${id}`;
  return `/collection/${id}`;
}

/**
 * Where to go right after a sign-in. An invite target is opened first (the invite page sends a newcomer on to
 * the intro after accepting). A newcomer who came for a Need goes to that Need (through the name step) and is
 * offered the intro after taking part; any other target waits behind the intro for a new account.
 */
export function afterSignInPath(userId: string, isNew: boolean, redirect?: string | null): string {
  const pendingNeed = takePendingSosPath();
  const pendingInvite = readPendingInvite();
  const target = safePath(redirect) ?? pendingNeed ?? (pendingInvite ? `/invite/${pendingInvite}` : null);
  if (isNew) markFirstRun(userId);

  if (target?.startsWith('/invite/')) return target;
  if (target && /^\/collection\/[\w-]+(?:[?#]|$)/.test(target)) {
    setPendingInvite(null);
    return isNew || isFirstRunPending(userId) ? namePath(target) : target;
  }
  if (isNew) return introPath(target);
  return target ?? homePath(userId);
}

/**
 * The masked e-mail of an existing account ("an•••@gmail.com") from the URL or the API, or null.
 * Anything else is dropped and the linking screen is shown without the address.
 */
export function safeMasked(raw: unknown): string | null {
  return typeof raw === 'string' && /^[^\s<>@]{1,3}•••@[A-Za-z0-9.-]{1,253}$/.test(raw) ? raw : null;
}
