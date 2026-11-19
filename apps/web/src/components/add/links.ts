import { WEB_APP_URL } from '../../lib/deployment';
import { DEFAULT_WEB_APP_ALT_URL } from '@so/shared';

/** Label shown on the card: host "orginizer.com/i" + slug "anna". The host drops a leading www. */
export function prettyInvite(slug: string): { host: string; slug: string } {
  let host = new URL(DEFAULT_WEB_APP_ALT_URL).host;
  try {
    host = new URL(WEB_APP_URL).host.replace(/^www\./, '');
  } catch {
    host = new URL(DEFAULT_WEB_APP_ALT_URL).host;
  }
  return { host: `${host}/i`, slug };
}

/** Working permanent link: /i/<slug> opens the invite page (SlugRedirect). Old ?invite= links still work. */
export function permanentInviteUrl(slug: string): string {
  return `${WEB_APP_URL}/i/${encodeURIComponent(slug)}`;
}

/** Live QR. Uses the current origin so two browsers on the same dev server can read each other. */
export function liveInviteUrl(token: string): string {
  const origin = typeof window === 'undefined' ? WEB_APP_URL : window.location.origin;
  return `${origin}/invite/${encodeURIComponent(token)}`;
}

export function appOrigin(): string {
  return WEB_APP_URL;
}
