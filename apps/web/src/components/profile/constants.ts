/** Shown in About. The web package version is 0.1.0; there is no build number to display. */
export const APP_VERSION = '0.1.0';

export const COMMUNITY_URL = 'https://t.me/+729vJwVZ5ltlMWRk';
export const GITHUB_URL = 'https://github.com/element1965/Social-organizer';

export const STAKE_PRESETS = [1, 5, 15, 30] as const;

export const ONLINE_MS = 5 * 60 * 1000;

export function publicHost(): string {
  const raw = import.meta.env.VITE_WEB_APP_URL || 'https://www.orginizer.com';
  try {
    return new URL(raw).host;
  } catch {
    return 'www.orginizer.com';
  }
}
