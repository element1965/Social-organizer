import type { Campaign } from '@so/shared';
import { ANDROID_APP_PACKAGE, IOS_STORE_ID, WEB_APP_URL, TELEGRAM_BOT_URL } from './deployment';
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

const AUTH_PROVIDERS: AuthProvider[] = ['google', 'apple', 'telegram', 'email'];

/** Put the device's preferred option first when configured. The Mini App offers Telegram and e-mail. */
export function orderAuthProviders(
  device: Device,
  available: Record<AuthProvider, boolean>,
  inTelegram: boolean,
): AuthProvider[] {
  const visible = AUTH_PROVIDERS.filter((provider) => available[provider]
    && (!inTelegram || provider === 'telegram' || provider === 'email'));
  const preferred = inTelegram ? 'telegram' : device === 'ios' ? 'apple' : 'google';
  return visible.includes(preferred) ? [preferred, ...visible.filter((provider) => provider !== preferred)] : visible;
}

/** Canonical public origin: the QR on the desktop site must open production, not the host it was shown on. */
export const SITE_ORIGIN = WEB_APP_URL;

/** Public store and bot addresses. */
export const STORE_URL = {
  play: 'https://play.google.com/store/apps/details?id=' + ANDROID_APP_PACKAGE,
  appstore: 'https://apps.apple.com/app/id' + IOS_STORE_ID,
  telegram: TELEGRAM_BOT_URL,
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
export function storeLinks(invite?: string | null, campaign?: Campaign): StoreLinks {
  const links = { ...STORE_URL };
  const ref = invite ? 'invite_' + encodeURIComponent(invite) : '';
  if (ref) {
    links.appstore += '?ct=' + ref;
    links.telegram += '?start=' + ref;
  }
  if (campaign) {
    const referrer = new URLSearchParams({ ...campaign, so_campaign: '1' });
    if (invite) referrer.set('invite', invite);
    links.play += '&referrer=' + encodeURIComponent(referrer.toString());
  } else if (ref) {
    links.play += '&referrer=' + ref;
  }
  return links;
}

/** Where `/get` (the QR on the desktop site) sends a phone: its store; anything else gets the site. */
export function getTarget(dev: Device, invite?: string | null, campaign?: Campaign): string {
  const links = storeLinks(invite, campaign);
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
