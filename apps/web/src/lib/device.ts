/*
 * Device-aware entry for the site: the native way in first, Telegram second, the rest as text.
 * Port of docs/redesign/mockups/v2/device.js; returns data, the components render it.
 */

export type Device = 'android' | 'ios' | 'desktop';

export const DEVICE_LABEL: Record<Device, string> = { android: 'Android', ios: 'iPhone', desktop: 'Компьютер' };

type NavLike = Pick<Navigator, 'userAgent' | 'platform' | 'maxTouchPoints'>;

/** Detect the device by User-Agent (iPadOS reports itself as a Mac with touch). */
export function detectDevice(nav: NavLike | undefined = typeof navigator === 'undefined' ? undefined : navigator): Device {
  const ua = nav?.userAgent ?? '';
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/i.test(ua) || (nav?.platform === 'MacIntel' && (nav?.maxTouchPoints ?? 0) > 1)) return 'ios';
  return 'desktop';
}

export type ActionId = 'play' | 'appstore' | 'web' | 'how' | 'telegram';
export type IconId = 'play' | 'apple' | 'google' | 'telegram';

export interface HeroAction {
  id: ActionId;
  /** Brand glyph before the label, if any. */
  icon?: IconId;
  kind: 'primary' | 'secondary';
}

export interface HeroCta {
  primary: HeroAction;
  secondary: HeroAction;
  /** Show the "Prefer Telegram? Open it there" line; off on desktop. */
  telegramAlt: boolean;
}

/** Hero: the one action that fits the device, the browser as the alternative. */
export function heroCta(dev: Device): HeroCta {
  if (dev === 'android') {
    return { primary: { id: 'play', icon: 'play', kind: 'primary' }, secondary: { id: 'web', kind: 'secondary' }, telegramAlt: true };
  }
  if (dev === 'ios') {
    return { primary: { id: 'appstore', icon: 'apple', kind: 'primary' }, secondary: { id: 'web', kind: 'secondary' }, telegramAlt: true };
  }
  return { primary: { id: 'web', kind: 'primary' }, secondary: { id: 'how', kind: 'secondary' }, telegramAlt: false };
}

export type AuthProvider = 'google' | 'apple' | 'telegram';

export interface AuthButtons {
  /** Provider buttons in display order; Telegram is always second after the native one on phones. */
  order: AuthProvider[];
  /** E-mail sign-in is always shown as text under the buttons. */
  mail: true;
  /** Android: a small "Have an Apple ID? Sign in with Apple" link instead of a full button. */
  appleLink: boolean;
}

/** Sign-in: native first, Telegram next, the other native way as a small link (Android) or last button. */
export function authButtons(dev: Device): AuthButtons {
  const order: AuthProvider[] =
    dev === 'android' ? ['google', 'telegram'] : dev === 'ios' ? ['apple', 'google', 'telegram'] : ['google', 'apple', 'telegram'];
  return { order, mail: true, appleLink: dev === 'android' };
}

export type StoreId = 'play' | 'appstore' | 'web' | 'telegram';

export interface StoreButton {
  id: StoreId;
  /** The device's own store (or the browser on desktop) is dark/primary; the rest are light. */
  primary: boolean;
}

export interface StoreButtons {
  buttons: StoreButton[];
  /** Desktop only: a QR card that opens the right store from a phone camera. */
  qr: boolean;
}

/** Store block: the device's store first and dark, the rest light; a QR for the phone on desktop. */
export function storeButtons(dev: Device): StoreButtons {
  if (dev === 'android') {
    return { buttons: [{ id: 'play', primary: true }, { id: 'web', primary: false }, { id: 'telegram', primary: false }], qr: false };
  }
  if (dev === 'ios') {
    return { buttons: [{ id: 'appstore', primary: true }, { id: 'web', primary: false }, { id: 'telegram', primary: false }], qr: false };
  }
  return {
    buttons: [
      { id: 'web', primary: true },
      { id: 'play', primary: false },
      { id: 'appstore', primary: false },
      { id: 'telegram', primary: false },
    ],
    qr: true,
  };
}
