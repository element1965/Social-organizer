import { useEffect } from 'react';
import { setAskProgress, stepValue } from '../ui2/ask-progress';
import { useAskAccess } from '../../hooks/useAskAccess';

/**
 * Publishes the request-tab ring from the account-scoped gate query, labelled with the account it was asked for.
 * The shell shows it only for that account; until the new account's gate answers, the ring is quiet.
 */
export function AskProgressSync() {
  const { data, account } = useAskAccess();

  useEffect(() => {
    if (!data || !account) return;
    // Allowed (also for authors, developers and admins, whatever the counts): the ring is full, as the sheet says
    if (data.allowed) {
      setAskProgress({ circle: 1, network: 1 }, account);
      return;
    }
    // Completion comes from the server's flags (exact counts); the rounded network figure never fills the step
    setAskProgress(
      {
        circle: data.needDirect > 0 ? stepValue(data.directCount, data.needDirect, data.directMet) / data.needDirect : 0,
        network: data.needNetwork > 0 ? stepValue(data.networkCount, data.needNetwork, data.networkMet) / data.needNetwork : 0,
      },
      account,
    );
  }, [data, account]);

  return null;
}
