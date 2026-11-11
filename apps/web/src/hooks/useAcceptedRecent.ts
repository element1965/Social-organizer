import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

/**
 * "X confirmed the acquaintance": my requests the other person accepted in the last 7 days.
 * Telegram or push may never reach a newcomer (no Start in the bot, no subscription), so the app shows it
 * in the Circle feed and counts it in the navigation badge until the Circle has been opened.
 * "Seen" is the time of the newest confirmation shown; "dismissed" are the ones tapped away from the feed.
 * Both are kept per account on this device.
 */
const KEY = 'so.acceptedSeen';
const DISMISSED_KEY = 'so.acceptedDismissed';
const listeners = new Set<() => void>();

function readJson<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, T>) : {};
  } catch {
    return {};
  }
}

// In-memory copies: private mode (no storage) still remembers for the session
let memory: Record<string, number> = readJson<number>(KEY);
let dismissedMemory: Record<string, string[]> = readJson<string[]>(DISMISSED_KEY);
const EMPTY: string[] = [];

function dismissOne(userId: string, id: string) {
  const list = dismissedMemory[userId] ?? [];
  if (list.includes(id)) return;
  // Confirmations live 7 days on the server; keep the last 50 ids, older ones are gone by then
  dismissedMemory = { ...dismissedMemory, [userId]: [...list, id].slice(-50) };
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedMemory));
  } catch {
    /* storage blocked: the in-memory copy is the record */
  }
  for (const fn of listeners) fn();
}

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
  const dismissed = useSyncExternalStore(subscribe, () => (userId ? dismissedMemory[userId] ?? EMPTY : EMPTY));

  const items = useMemo<AcceptedItem[]>(
    () =>
      (query.data ?? [])
        .filter((row) => !dismissed.includes(row.id))
        .map((row) => {
          const at = new Date(row.at).getTime();
          return { id: row.id, at, person: row.person, unseen: at > seenAt };
        }),
    [query.data, seenAt, dismissed],
  );

  const markSeen = useCallback(() => {
    if (!userId || !items.length) return;
    write(userId, Math.max(...items.map((i) => i.at)));
  }, [userId, items]);

  /** One tap on the row: it has said what it had to say, so it leaves the feed (and the badge). */
  const dismiss = useCallback(
    (id: string) => {
      if (userId) dismissOne(userId, id);
    },
    [userId],
  );

  return { items, unseen: items.filter((i) => i.unseen).length, markSeen, dismiss, loading: query.isLoading };
}
