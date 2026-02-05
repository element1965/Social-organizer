import { isTelegramWebApp } from '@so/tg-adapter';

const TG_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '';

/**
 * Build invite URL based on current context.
 * In Telegram Mini App: https://t.me/BOTNAME?startapp=invite_TOKEN
 * In browser: https://origin/invite/TOKEN
 */
export function buildInviteUrl(token: string): string {
  if (isTelegramWebApp() && TG_BOT_USERNAME) {
    return `https://t.me/${TG_BOT_USERNAME}?startapp=invite_${token}`;
  }
  return `${window.location.origin}/invite/${token}`;
}
