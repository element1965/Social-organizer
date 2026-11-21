import { WEB_APP_URL } from './deployment';

/**
 * Build the short web invite URL, orginizer.com/i/<token>, for sharing outside Telegram.
 * It opens the same invite page as the older /?invite=<token> form, which keeps working.
 */
export function buildWebInviteUrl(token: string): string {
  return `${WEB_APP_URL}/i/${encodeURIComponent(token)}`;
}

/**
 * Build SOS collection invite URL.
 * Always points to the public web landing page /sos/:id — no auth required.
 * The page shows collection info and has a button to open the Telegram Mini App.
 * Recipients are auto-connected to the collection creator (no approval needed) on entry.
 */
export function buildSosInviteUrl(collectionId: string): string {
  return `${WEB_APP_URL}/sos/${collectionId}`;
}
