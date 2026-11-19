import { WEB_APP_URL, TELEGRAM_MINI_APP_BOT } from './deployment';
import { isTelegramWebApp } from '@so/tg-adapter';


/**
 * Build invite URL based on current context.
 * In Telegram Mini App: https://t.me/BOTNAME?start=invite_TOKEN
 *   → Bot receives /start invite_TOKEN → replies with web_app button
 * In browser: https://origin/invite/TOKEN
 */
export function buildInviteUrl(token: string): string {
  if (isTelegramWebApp() && TELEGRAM_MINI_APP_BOT) {
    return `https://t.me/${TELEGRAM_MINI_APP_BOT}?start=invite_${token}`;
  }
  return `${window.location.origin}/invite/${token}`;
}

/**
 * Build the short web invite URL, orginizer.com/i/<token>, for sharing outside Telegram.
 * It opens the same invite page as the older /?invite=<token> form, which keeps working.
 */
export function buildWebInviteUrl(token: string): string {
  return `${WEB_APP_URL}/i/${encodeURIComponent(token)}`;
}

/**
 * Build Telegram bot invite URL (always points to bot).
 */
export function buildBotInviteUrl(token: string): string {
  if (TELEGRAM_MINI_APP_BOT) {
    return `https://t.me/${TELEGRAM_MINI_APP_BOT}?start=invite_${token}`;
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
