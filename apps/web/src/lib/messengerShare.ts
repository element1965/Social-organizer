import type { InviteSrcParam } from '@so/shared';
import { isTelegramWebApp } from '@so/tg-adapter';
import { openExternal } from '../components/profile/openExternal';

/** The two messengers a link can be sent to with one tap; the value is also the `?src=` of the link. */
export type Messenger = InviteSrcParam;

/** Adds `?src=` to a shared address, so the admin funnel can tell which way of sending works. */
export function withSrc(url: string, src: Messenger): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('src', src);
    return parsed.toString();
  } catch {
    return url;
  }
}

/** The messenger's own "send a message" address with the text and the link filled in. */
export function messengerShareUrl(messenger: Messenger, text: string, url: string): string {
  if (messenger === 'wa') return `https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`;
  return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
}

/** Opens the messenger with the message ready; the person picks the chat and sends it themselves. */
export function openMessengerShare(messenger: Messenger, text: string, url: string): void {
  const target = messengerShareUrl(messenger, text, url);
  let inTelegram = false;
  try {
    inTelegram = isTelegramWebApp();
  } catch {
    inTelegram = false;
  }
  // Inside the Mini App a t.me link must stay in Telegram instead of opening the browser
  if (messenger === 'tg' && inTelegram && window.Telegram?.WebApp?.openTelegramLink) {
    window.Telegram.WebApp.openTelegramLink(target);
    return;
  }
  openExternal(target);
}
