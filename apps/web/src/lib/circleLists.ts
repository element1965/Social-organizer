/**
 * The Circle's lists that the shell's pulse (hooks/usePulse.ts) watches. Coming back to the Circle within
 * CIRCLE_STALE_MS shows them from memory instead of reading all of them again: a change made elsewhere is
 * re-read by the pulse within its interval, and the five-minute safety net still runs.
 *
 * The person's own actions must never look missing, so every mutation marks these lists stale when it
 * settles (App.tsx, mutationCache). Marking only: nothing is refetched then, a list on screen is refreshed
 * by its own call site, and a list that is not mounted is read again when it next mounts, as before.
 * Not for screens that poll because they are live (the Need page, support chat, the QR acquaintance count).
 */
export const CIRCLE_STALE_MS = 30_000;

/** tRPC procedure paths, as they appear in the first element of a tRPC query key. */
export const CIRCLE_LIST_PATHS: ReadonlySet<string> = new Set([
  'notification.unreadCount',
  'notification.list',
  'notification.attention',
  'pending.incoming',
  'pending.incomingCount',
  'pending.myPending',
  'collection.myParticipating',
  'collection.myActive',
  'milestone.list',
]);

export function isCircleListKey(key: readonly unknown[]): boolean {
  const path = key[0];
  return Array.isArray(path) && CIRCLE_LIST_PATHS.has(path.join('.'));
}
