import { trpc } from '../../lib/trpc';
import { trpcCode } from './errors';
import { isOpenParticipation, isPastParticipation } from './collections';

/**
 * How many Needs the list screen (`/me/history`) holds under Open and under Past: the person's own Needs plus the
 * ones they take part in. Null until the lists have loaded. Shared by the Need tab link and the Profile row, so both
 * show the same numbers as the screen they lead to.
 */
export function useNeedCounts(): { open: number; past: number } | null {
  const me = trpc.user.me.useQuery();
  const active = trpc.collection.myActive.useQuery();
  const participating = trpc.collection.myParticipating.useQuery();
  const history = trpc.collection.myHistory.useQuery(undefined, { retry: false });

  // An API without myHistory yet counts as no own past Needs rather than hiding the numbers.
  const historyMissing = history.isError && trpcCode(history.error) === 'NOT_FOUND';
  if (!me.data || !active.data || !participating.data || (!history.data && !historyMissing)) return null;

  const selfId = me.data.id;
  const joined = participating.data;
  return {
    open: active.data.length + joined.filter((row) => isOpenParticipation(row, selfId)).length,
    past: (history.data?.length ?? 0) + joined.filter((row) => isPastParticipation(row, selfId)).length,
  };
}
