import { CIRCLE_STALE_MS } from '../lib/circleLists';
import { trpc } from '../lib/trpc';

export function useCircleAttention(): number | undefined {
  const { data } = trpc.notification.attention.useQuery(undefined, { staleTime: CIRCLE_STALE_MS });
  return data && data.needs + data.incoming;
}
