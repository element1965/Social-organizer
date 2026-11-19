/*
 * How the system browser hands a Google sign-in back to the native app. The Apple flow does the same on the
 * server (apps/api/src/index.ts, appleRedirect). iOS opens the app by its URL scheme; Android gets an intent://
 * link, which also closes the Chrome Custom Tab. Safari on iOS cannot open intent:// at all.
 */
import { detectDevice } from './device';

export type NativePlatform = 'ios' | 'android';

type NavLike = Parameters<typeof detectDevice>[0];

/** The platform the sign-in started on: the one in the OAuth state, else this browser's device (older states). */
export function nativePlatform(fromState: unknown, nav?: NavLike): NativePlatform {
  if (fromState === 'ios' || fromState === 'android') return fromState;
  return detectDevice(nav) === 'ios' ? 'ios' : 'android';
}

/** socialorganizer://auth-success?… on iOS; on Android the intent:// link with a web fallback. */
export function nativeAuthUrl(
  platform: NativePlatform,
  path: 'auth-success' | 'auth-error',
  query: string,
  fallback: string,
): string {
  if (platform === 'ios') return `socialorganizer://${path}?${query}`;
  return `intent://${path}?${query}#Intent;scheme=socialorganizer;package=com.socialorganizer.app;S.browser_fallback_url=${encodeURIComponent(fallback)};end`;
}
