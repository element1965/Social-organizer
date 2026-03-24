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
 * Recipients who open it are auto-connected to the collection creator (no approval needed).
 * In Telegram Mini App: uses startapp param → TelegramBootstrap handles it directly.
 * In browser: opens collection page with sos=true query param.
 */
export function buildSosInviteUrl(collectionId: string): string {
  if (isTelegramWebApp() && TG_BOT_USERNAME) {
    return `https://t.me/${TG_BOT_USERNAME}?startapp=sos_${collectionId}`;
  }
  return `${WEB_APP_URL}/collection/${collectionId}?sos=true`;
}
