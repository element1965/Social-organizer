import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';
import { scopedRetry, useAccountChangeRecovery } from './accountScope';

/**
 * The request gate (`collection.askAccess`) for the signed-in account: the Need tab, its "path to a Need" sheet,
 * the tab ring and the Circle's "N of 5" strip. The query names the account it is for, so an answer for a
 * previous session is refused by the server (ACCOUNT_CHANGED, never retried: the tab re-reads the stored
 * session and the query re-keys). The network figure on screens comes from useNetworkFigure, not from here.
 */
export function useAskAccess(opts: { enabled?: boolean } = {}) {
  const account = useAuth((s) => s.userId);
  const query = trpc.collection.askAccess.useQuery(account ? { account } : undefined, {
    enabled: !!account && opts.enabled !== false,
    retry: scopedRetry,
  });
  useAccountChangeRecovery(query.error);
  return { ...query, account };
}
