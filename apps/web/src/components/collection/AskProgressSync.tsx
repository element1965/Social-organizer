import { useEffect } from 'react';
import { setAskProgress } from '../ui2/ask-progress';
import { trpc } from '../../lib/trpc';

/** Publishes the request-tab ring. The shell reads it; this screen owns the numbers. */
export function AskProgressSync() {
  const { data } = trpc.collection.askAccess.useQuery();

  useEffect(() => {
    if (!data) return;
    if (data.allowed) {
      setAskProgress({ circle: 1, network: 1 });
      return;
    }
    setAskProgress({
      circle: data.needDirect > 0 ? data.directCount / data.needDirect : 0,
      network: data.needNetwork > 0 ? data.networkCount / data.needNetwork : 0,
    });
  }, [data]);

  return null;
}
