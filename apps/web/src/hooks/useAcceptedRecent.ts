import { useCallback, useMemo, useRef, useState } from 'react';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';

/**
 * "X confirmed the acquaintance": my requests the other person accepted in the last 7 days.
 * Telegram or push may never reach a newcomer (no Start in the bot, no subscription), so the app shows it
 * in the Circle feed and counts it in the navigation badge until the Circle has been opened.
 * Seen and dismissed are kept on the server (pending.markAcceptedSeen / dismissAccepted), so a confirmation
 * is announced once, not again on every new device; the server stops returning it once it is seen.
 * Kept fresh by the app-wide pulse (hooks/usePulse.ts), not by a timer of its own.
 */
export type AcceptedItem = { id: string; at: number; person: { id: string; name: string; photoUrl: string | null }; unseen: boolean };

export function useAcceptedRecent() {
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const query = trpc.pending.acceptedRecent.useQuery(undefined, { enabled: !!userId });
  const markSeenMutation = trpc.pending.markAcceptedSeen.useMutation();
  const dismissMutation = trpc.pending.dismissAccepted.useMutation({
    onSettled: () => void utils.pending.acceptedRecent.invalidate(),
  });
  // Local copies so the badge and the row react at once, before the server answers
  const [seenHere, setSeenHere] = useState<ReadonlySet<string>>(() => new Set());
  const [dismissedHere, setDismissedHere] = useState<ReadonlySet<string>>(() => new Set());
  const sent = useRef(new Set<string>());

  const items = useMemo<AcceptedItem[]>(
    () =>
      (query.data ?? [])
        .filter((row) => !dismissedHere.has(row.id))
        .map((row) => ({
          id: row.id,
          at: new Date(row.at).getTime(),
          person: row.person,
          unseen: !row.seen && !seenHere.has(row.id),
        })),
    [query.data, seenHere, dismissedHere],
  );

  const markSeen = useCallback(() => {
    const ids = items.filter((i) => i.unseen && !sent.current.has(i.id)).map((i) => i.id);
    if (!ids.length) return;
    for (const id of ids) sent.current.add(id);
    setSeenHere((prev) => new Set([...prev, ...ids]));
    markSeenMutation.mutate({ ids });
  }, [items, markSeenMutation]);

  /** One tap on the row: it has said what it had to say, so it leaves the feed (and the badge). */
  const dismiss = useCallback(
    (id: string) => {
      setDismissedHere((prev) => new Set(prev).add(id));
      dismissMutation.mutate({ id });
    },
    [dismissMutation],
  );

  return { items, unseen: items.filter((i) => i.unseen).length, markSeen, dismiss, loading: query.isLoading };
}
