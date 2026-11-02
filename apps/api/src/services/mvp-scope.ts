/**
 * Money MVP scope.
 *
 * The MVP keeps personal connections, money collections with intentions,
 * contacts and the notifications they need. Skills, needs, matching and
 * exchange chains are out of scope: their routes, API and background
 * messages are switched off here. Stored data is kept untouched.
 *
 * Set FEATURE_SKILLS=true to switch the old scenarios back on.
 */
export const SKILLS_FEATURE_ENABLED = process.env.FEATURE_SKILLS === 'true';

/** App paths that belong to retired scenarios. */
export const RETIRED_PATHS = ['/matches', '/skills', '/needs'];

/** True if the URL points to a retired screen of the app. */
export function isRetiredUrl(url: string | null | undefined): boolean {
  if (!url || SKILLS_FEATURE_ENABLED) return false;
  let path: string;
  try {
    path = new URL(url, 'https://www.orginizer.com').pathname;
  } catch {
    return false;
  }
  return RETIRED_PATHS.some((p) => path === p || path.startsWith(`${p}/`));
}

/**
 * Auto-chain messages that invite users into retired scenarios.
 * Skills reminders were seeded with sortOrder >= 100 (packages/db/prisma/seed-chain-skills.ts).
 */
export function isRetiredChainMessage(msg: { sortOrder: number; buttonUrl?: string | null }): boolean {
  if (SKILLS_FEATURE_ENABLED) return false;
  return msg.sortOrder >= 100 || isRetiredUrl(msg.buttonUrl);
}
