import {
  DEFAULT_ANDROID_APP_PACKAGE,
  DEFAULT_IOS_STORE_ID,
  DEFAULT_NATIVE_AUTH_SCHEME,
  DEFAULT_TELEGRAM_BOT_USERNAME,
  DEFAULT_WEB_APP_ALT_URL,
  DEFAULT_WEB_APP_URL,
} from '@so/shared';

export const WEB_APP_URL = (import.meta.env.VITE_WEB_APP_URL || DEFAULT_WEB_APP_URL).replace(/\/$/, '');
export const WEB_APP_ALT_URL = import.meta.env.VITE_WEB_APP_ALT_URL ||
  (WEB_APP_URL === DEFAULT_WEB_APP_URL ? DEFAULT_WEB_APP_ALT_URL : '');
export const TELEGRAM_BOT_USERNAME = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim() ||
  DEFAULT_TELEGRAM_BOT_USERNAME;
export const TELEGRAM_BOT_URL = 'https://t.me/' + TELEGRAM_BOT_USERNAME;
// The Mini App link is opt-in for flows that historically required an explicitly configured bot.
export const TELEGRAM_MINI_APP_BOT = import.meta.env.VITE_TELEGRAM_BOT_USERNAME?.trim() || '';
export const ANDROID_APP_PACKAGE = import.meta.env.VITE_ANDROID_APP_PACKAGE || DEFAULT_ANDROID_APP_PACKAGE;
export const IOS_STORE_ID = import.meta.env.VITE_IOS_STORE_ID || DEFAULT_IOS_STORE_ID;
export const NATIVE_AUTH_SCHEME = import.meta.env.VITE_NATIVE_AUTH_SCHEME || DEFAULT_NATIVE_AUTH_SCHEME;
export const GOOGLE_RETURN_URL = import.meta.env.VITE_GOOGLE_RETURN_URL || WEB_APP_URL + '/auth/google/callback';
export const APPLE_RETURN_URL = import.meta.env.VITE_APPLE_RETURN_URL || WEB_APP_URL + '/api/auth/apple/callback';
export const WEB_APP_HOSTS = [WEB_APP_URL, WEB_APP_ALT_URL].flatMap((url) => {
  try { return [new URL(url).hostname.toLowerCase()]; }
  catch { return []; }
});
