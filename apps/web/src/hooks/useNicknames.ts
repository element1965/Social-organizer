import { useMemo, useCallback } from 'react';
import { trpc } from '../lib/trpc';

export function useNicknames() {
  const { data: connections } = trpc.connection.list.useQuery();

  const nicknameMap = useMemo(() => {
    const map = new Map<string, string>();
    if (connections) {
      for (const c of connections) {
        if (c.nickname) map.set(c.userId, c.nickname);
      }
    }
    return map;
  }, [connections]);

  const resolve = useCallback(
    (userId: string, fallbackName: string) =>
      nicknameMap.get(userId) || fallbackName,
    [nicknameMap],
  );

  return resolve;
}
