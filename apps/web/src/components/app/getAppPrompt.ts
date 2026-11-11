import { Capacitor } from '@capacitor/core';
import { isTelegramWebApp } from '@so/tg-adapter';
import type { Device } from '../../lib/device';

const DISMISS_KEY = 'so.getApp.dismissedAt';
/** A closed prompt comes back after this long: the person may have changed their mind. */
const DISMISS_MS = 30 * 24 * 60 * 60 * 1000;

/** Inside the native app there is nothing to install. */
export function isInNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/**
 * The Circle prompt: only in a phone browser. The native app already is the app; the Telegram Mini App is a
 * deliberate choice of its own, so it only gets the quiet row in the profile; a computer gets the row too.
 */
export function showsGetAppPrompt(device: Device): boolean {
  if (device === 'desktop' || isInNativeApp() || isTelegramWebApp()) return false;
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return !at || Date.now() - at > DISMISS_MS;
  } catch {
    return true;
  }
}

export function dismissGetAppPrompt(): void {
  try {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    /* storage unavailable: the prompt simply returns on the next visit */
  }
}
