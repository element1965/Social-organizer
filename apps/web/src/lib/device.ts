/*
 * Device-aware entry for the site: the native way in first, Telegram second, the rest as text.
 * Port of docs/redesign/mockups/v2/device.js; returns data, the components render it.
 */
import { useState } from 'react';

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

export type AuthProvider = 'google' | 'apple' | 'telegram' | 'email';

/** Sign-in options per device, in display order (product decision 2026-11-09). E-mail is always last. */
export const AUTH_ORDER: Record<Device, AuthProvider[]> = {
  android: ['google', 'telegram', 'email'],
  ios: ['apple', 'google', 'telegram', 'email'],
  desktop: ['google', 'apple', 'telegram', 'email'],
};

export interface AuthButtons {
  /** Sign-in options in display order; the last one is always e-mail. */
  order: AuthProvider[];
}

export function authButtons(dev: Device): AuthButtons {
  return { order: AUTH_ORDER[dev] };
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

/** Public store and bot addresses. */
export const STORE_URL = {
  play: 'https://play.google.com/store/apps/details?id=com.socialorganizer.app',
  appstore: 'https://apps.apple.com/app/id6768132198',
  telegram: 'https://t.me/socialorganizer_bot',
} as const;

export interface StoreLinks {
  play: string;
  appstore: string;
  telegram: string;
}

/**
 * Store links that carry a pending invite: Google Play gets an install referrer (delivered to the app via the
 * Play Install Referrer API), Telegram a start parameter. Apple only records the campaign token (ct) in App Store
 * Connect analytics; it does not reach the app after install.
 */
export function storeLinks(invite?: string | null): StoreLinks {
  if (!invite) return { ...STORE_URL };
  const ref = `invite_${encodeURIComponent(invite)}`;
  return {
    play: `${STORE_URL.play}&referrer=${ref}`,
    appstore: `${STORE_URL.appstore}?ct=${ref}`,
    telegram: `${STORE_URL.telegram}?start=${ref}`,
  };
}

/** Where `/get` (the QR on the desktop site) sends a phone: its store; anything else gets the site. */
export function getTarget(dev: Device, invite?: string | null): string {
  const links = storeLinks(invite);
  if (dev === 'android') return links.play;
  if (dev === 'ios') return links.appstore;
  return invite ? `/invite/${encodeURIComponent(invite)}` : '/';
}

const DEVICES: readonly Device[] = ['android', 'ios', 'desktop'];

/**
 * The visitor's device. `?device=android|ios|desktop` overrides the User-Agent so the three variants can be
 * checked from one browser (QA, screenshots); it only changes the order of buttons, never what is available.
 */
export function useDevice(): Device {
  const [dev] = useState<Device>(() => {
    try {
      const forced = new URLSearchParams(window.location.search).get('device');
      if (forced && (DEVICES as readonly string[]).includes(forced)) return forced as Device;
    } catch {
      /* no window */
    }
    return detectDevice();
  });
  return dev;
}
