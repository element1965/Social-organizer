/**
 * Guards for post-login navigation targets. Untrusted input (`?redirect=`, deep-link params,
 * Telegram start params, localStorage) must never reach `window.location.href` / `navigate`
 * unless it is a same-origin relative path.
 */

const TOKEN_RE = /^[\w-]+$/;

/** Returns the path if it is a same-origin relative path, otherwise `fallback`. */
export function safeRedirectPath<F = null>(raw: string | null | undefined, fallback: F = null as F): string | F {
  if (!raw || typeof raw !== 'string') return fallback;
  // Must start with a single "/" (rejects "//host", "/\host", schemes, relative paths)
  if (raw[0] !== '/' || raw[1] === '/' || raw[1] === '\\') return fallback;
  // Reject control characters, whitespace and backslashes anywhere
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\s\\]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
  } catch {
    return fallback;
  }
  return raw;
}

/** Invite / link tokens are opaque url-safe strings. */
export function isSafeToken(token: string | null | undefined): token is string {
  return !!token && TOKEN_RE.test(token);
}

/** `/invite/<token>` for a valid token, otherwise null. */
export function invitePath(token: string | null | undefined): string | null {
  return isSafeToken(token) ? `/invite/${encodeURIComponent(token)}` : null;
}
