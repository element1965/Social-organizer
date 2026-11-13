import { useEffect, useRef } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

/** The shortest interval any of the replaced timers had (incoming requests). */
export const PULSE_MS = 20_000;

type Utils = ReturnType<typeof trpc.useUtils>;

/** The lists the pulse can re-read. */
const LISTS = {
  notifications: (u: Utils) => u.notification.list.invalidate(),
  unread: (u: Utils) => u.notification.unreadCount.invalidate(),
  attention: (u: Utils) => u.notification.attention.invalidate(),
  incoming: (u: Utils) => u.pending.incoming.invalidate(),
  incomingCount: (u: Utils) => u.pending.incomingCount.invalidate(),
  outgoing: (u: Utils) => u.pending.myPending.invalidate(),
  accepted: (u: Utils) => u.pending.acceptedRecent.invalidate(),
  mine: (u: Utils) => u.collection.myActive.invalidate(),
  participating: (u: Utils) => u.collection.myParticipating.invalidate(),
  milestones: (u: Utils) => u.milestone.list.invalidate(),
  reviews: (u: Utils) => u.moderation.myOpenReviews.invalidate(),
  connectionCount: (u: Utils) => u.connection.getCount.invalidate(),
} satisfies Record<string, (u: Utils) => Promise<unknown>>;

type List = keyof typeof LISTS;

/**
 * Which lists each group of the pulse stands for. Invalidation refetches the lists on screen and marks the
 * others stale, so they are read again when a screen mounts them.
 */
const DEPENDENTS: Record<string, List[]> = {
  notifications: ['notifications', 'unread', 'attention'],
  incoming: ['incoming', 'incomingCount', 'attention'],
  outgoing: ['outgoing'],
  accepted: ['accepted'],
  mine: ['mine'],
  // Joining a Need ends its request in the badge, and the notices carry my own pledge on it
  participating: ['participating', 'attention', 'notifications'],
  milestones: ['milestones'],
  reviews: ['reviews'],
  // The Circle watches this count (components/circle/network.ts): a change there announces a join and
  // refreshes the heavy network queries. The milestone list carries the same number.
  connections: ['connectionCount', 'milestones'],
};

/**
 * One light "what changed" poll for the whole signed-in app (notification.pulse), in place of a timer per list.
 * The first answer only seeds the memory; after that every group that differs from the previous answer re-reads
 * exactly the lists that depend on it (each list once). The lists still load on mount and after mutations as
 * before. A failed poll changes nothing here: connectivity is judged by the shared fetch (lib/trpc.ts) as for
 * any query, and the next tick simply tries again.
 */
export function usePulse() {
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const pulse = trpc.notification.pulse.useQuery(undefined, { enabled: !!userId, refetchInterval: PULSE_MS, retry: false });
  const last = useRef<{ userId: string; groups: Record<string, string> } | null>(null);

  useEffect(() => {
    const data = pulse.data as Record<string, unknown> | undefined;
    if (!data || !userId) return;
    const groups: Record<string, string> = {};
    for (const key of Object.keys(DEPENDENTS)) groups[key] = JSON.stringify(data[key] ?? null);
    const prev = last.current?.userId === userId ? last.current.groups : null;
    last.current = { userId, groups };
    if (!prev) return;
    const stale = new Set<List>();
    for (const key of Object.keys(DEPENDENTS)) {
      if (prev[key] !== groups[key]) for (const list of DEPENDENTS[key]!) stale.add(list);
    }
    for (const list of stale) void LISTS[list](utils);
  }, [pulse.data, userId, utils]);
}
