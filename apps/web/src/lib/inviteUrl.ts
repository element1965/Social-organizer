import { isTelegramWebApp } from '@so/tg-adapter';

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';

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
