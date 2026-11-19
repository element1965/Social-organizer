import {
  DEFAULT_ANDROID_APP_PACKAGE,
  DEFAULT_APPLE_BUNDLE_ID,
  DEFAULT_APPLE_TEAM_ID,
  DEFAULT_NATIVE_AUTH_SCHEME,
  DEFAULT_TELEGRAM_BOT_USERNAME,
  DEFAULT_WEB_APP_ALT_URL,
  DEFAULT_WEB_APP_URL,
} from '@so/shared';

export const WEB_APP_URL = process.env.WEB_APP_URL || DEFAULT_WEB_APP_URL;
function hostOf(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return '';
  }
}

// The production pair (www and apex) is matched by host, so a trailing slash or the apex form in WEB_APP_URL still
// keeps both origins allowed, as before this value became configurable
const DEFAULT_HOSTS = [hostOf(DEFAULT_WEB_APP_URL), hostOf(DEFAULT_WEB_APP_ALT_URL)];
const webHost = hostOf(WEB_APP_URL);
export const WEB_APP_ALT_URL = process.env.WEB_APP_ALT_URL ||
  (DEFAULT_HOSTS.includes(webHost)
    ? (webHost === DEFAULT_HOSTS[0] ? DEFAULT_WEB_APP_ALT_URL : DEFAULT_WEB_APP_URL)
    : '');
export const TELEGRAM_BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ||
  process.env.VITE_TELEGRAM_BOT_USERNAME || DEFAULT_TELEGRAM_BOT_USERNAME;
export const ANDROID_APP_PACKAGE = process.env.ANDROID_APP_PACKAGE || DEFAULT_ANDROID_APP_PACKAGE;
export const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || DEFAULT_APPLE_TEAM_ID;
export const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || DEFAULT_APPLE_BUNDLE_ID;
export const NATIVE_AUTH_SCHEME = process.env.NATIVE_AUTH_SCHEME || DEFAULT_NATIVE_AUTH_SCHEME;
export const SUPPORT_CHAT_ID = Number(process.env.SUPPORT_CHAT_ID || '-4946509857');
