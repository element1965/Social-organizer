import { useEffect, useState } from 'react';
import { readContacts, readFromLocal, type SavedPerson } from '@so/gun-backup';
import { buildSavedModel, type SavedModel } from '../lib/savedCopy';
import { useAuth } from './useAuth';

type State = {
  /** The account this state was read for: it is never shown to another one. */
  forUser: string | null;
  status: 'loading' | 'ready';
  model: SavedModel | null;
  contacts: Record<string, SavedPerson>;
};

/** The copy of the signed-in person's network saved on this device. Only read while `enabled` (offline). */
export function useSavedCopy(enabled: boolean): State {
  const userId = useAuth((s) => s.userId);
  const [state, setState] = useState<State>({ forUser: null, status: 'loading', model: null, contacts: {} });

  useEffect(() => {
    if (!enabled || !userId) return;
    let alive = true;
    setState((current) => (current.forUser === userId ? current : { forUser: userId, status: 'loading', model: null, contacts: {} }));
    void Promise.all([readFromLocal(userId).catch(() => null), readContacts(userId).catch(() => ({}))]).then(([graph, contacts]) => {
      if (!alive) return;
      setState({ forUser: userId, status: 'ready', model: graph ? buildSavedModel(graph) : null, contacts });
    });
    return () => {
      alive = false;
    };
  }, [enabled, userId]);

  // Another account signed in since this was read: show nothing of it until the new read finishes
  return state.forUser === userId ? state : { forUser: userId, status: 'loading', model: null, contacts: {} };
}
