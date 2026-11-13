import { inviteSrcParam, type InviteSrcParam } from '@so/shared';

/**
 * `?src=` of the shared invite address (which messenger the link was sent through). It only feeds the
 * admin funnel. Kept on the device from the moment the page opens until the request is sent, because
 * signing in (OAuth round-trips, reloads) drops the query string.
 */
const KEY = 'so.inviteSrc';

export function rememberInviteSrc(raw: string | null | undefined): void {
  const value = inviteSrcParam(raw);
  if (!value) return;
  try {
    window.localStorage.setItem(KEY, value);
  } catch {
    /* private window: the request is simply counted as a plain link */
  }
}

export function readInviteSrc(): InviteSrcParam | undefined {
  try {
    return inviteSrcParam(window.localStorage.getItem(KEY));
  } catch {
    return undefined;
  }
}

export function clearInviteSrc(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* nothing to clear */
  }
}

/** One count per browser session and link: reloading the page or coming back from sign-in adds nothing. */
export function firstOpenOf(token: string): boolean {
  const key = `so.inviteOpened:${token}`;
  try {
    if (window.sessionStorage.getItem(key)) return false;
    window.sessionStorage.setItem(key, '1');
    return true;
  } catch {
    return false;
  }
}
