import { isSafeContactUrl } from '@so/shared';
import { isTelegramWebApp } from '@so/tg-adapter';

export function isMobileUa(): boolean {
  return /Android|iPhone|iPad/i.test(navigator.userAgent);
}

export function instagramHandle(value: string): string {
  return value.replace(/^@/, '').replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//, '').replace(/\/$/, '');
}

/** Open a messenger or site. Telegram Mini App must use openLink; mailto and tel stay on the anchor. */
export function openExternal(url: string) {
  if (!isSafeContactUrl(url)) return;
  if (isTelegramWebApp() && !url.startsWith('mailto:') && !url.startsWith('tel:')) {
    window.Telegram?.WebApp?.openLink?.(url, { try_instant_view: false });
    return;
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
