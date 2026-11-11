import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

/**
 * "X confirmed the acquaintance": my requests the other person accepted in the last 7 days.
 * Telegram or push may never reach a newcomer (no Start in the bot, no subscription), so the app shows it
 * in the Circle feed and counts it in the navigation badge until the Circle has been opened.
 * "Seen" is the time of the newest confirmation shown, kept per account on this device.
 */
const KEY = 'so.acceptedSeen';
const listeners = new Set<() => void>();

function readAll(): Record<string, number> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

// In-memory copy: private mode (no storage) still remembers for the session
let memory: Record<string, number> = readAll();

function write(userId: string, at: number) {
  if ((memory[userId] ?? 0) >= at) return;
  memory = { ...memory, [userId]: at };
  try {
    localStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* storage blocked: the in-memory copy is the record */
  }
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export type AcceptedItem = { id: string; at: number; person: { id: string; name: string; photoUrl: string | null }; unseen: boolean };

export function useAcceptedRecent() {
  const userId = useAuth((s) => s.userId);
  const query = trpc.pending.acceptedRecent.useQuery(undefined, { refetchInterval: 30_000, enabled: !!userId });
  const seenAt = useSyncExternalStore(subscribe, () => (userId ? memory[userId] ?? 0 : 0));

  const items = useMemo<AcceptedItem[]>(
    () =>
      (query.data ?? []).map((row) => {
        const at = new Date(row.at).getTime();
        return { id: row.id, at, person: row.person, unseen: at > seenAt };
      }),
    [query.data, seenAt],
  );

  const markSeen = useCallback(() => {
    if (!userId || !items.length) return;
    write(userId, Math.max(...items.map((i) => i.at)));
  }, [userId, items]);

  return { items, unseen: items.filter((i) => i.unseen).length, markSeen, loading: query.isLoading };
}
