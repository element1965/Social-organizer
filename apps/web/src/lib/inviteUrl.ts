import { isTelegramWebApp } from '@so/tg-adapter';

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';
const WEB_APP_URL = import.meta.env.VITE_WEB_APP_URL || 'https://www.orginizer.com';

/**
 * Build invite URL based on current context.
 * In Telegram Mini App: https://t.me/BOTNAME?start=invite_TOKEN
 *   → Bot receives /start invite_TOKEN → replies with web_app button
 * In browser: https://origin/invite/TOKEN
 */
export function buildInviteUrl(token: string): string {
  if (isTelegramWebApp() && TG_BOT_USERNAME) {
    return `https://t.me/${TG_BOT_USERNAME}?start=invite_${token}`;
  }
  return `${window.location.origin}/invite/${token}`;
}

/**
 * Build web invite URL (always points to landing page).
 * Used for sharing outside Telegram — recipient sees landing first.
 */
export function buildWebInviteUrl(token: string): string {
  return `${WEB_APP_URL}/?invite=${token}`;
}

/**
 * Build Telegram bot invite URL (always points to bot).
 */
export function buildBotInviteUrl(token: string): string {
  if (TG_BOT_USERNAME) {
    return `https://t.me/${TG_BOT_USERNAME}?start=invite_${token}`;
  }
  return `${window.location.origin}/invite/${token}`;
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

const PENDING_SOS_KEY = 'pendingSosCollection';

/** In-app path that opens a collection and auto-connects the viewer to its creator. */
export function sosCollectionPath(collectionId: string): string {
  return `/collection/${collectionId}?sos=true`;
}

/**
 * Remember the SOS collection while a browser user signs in or registers, so OAuth
 * round-trips (Google/Apple callback pages) can bring them back to it.
 */
export function savePendingSos(collectionId: string): void {
  localStorage.setItem(PENDING_SOS_KEY, collectionId);
}

/** Path of the remembered SOS collection (and forget it), or null. */
export function takePendingSosPath(): string | null {
  const collectionId = localStorage.getItem(PENDING_SOS_KEY);
  if (!collectionId) return null;
  localStorage.removeItem(PENDING_SOS_KEY);
  return sosCollectionPath(collectionId);
}
