import { create } from 'zustand';
import type { trpc } from '../../lib/trpc';

type Utils = ReturnType<typeof trpc.useUtils>;

export type JoinedPerson = { id: string; name: string; photoUrl: string | null };

type JoiningState = {
  /** The person who just joined my circle. The Circle shows them at once and says it is loading their network. */
  person: JoinedPerson | null;
  /** When the join was announced. A graph slice read before this moment does not count as loaded. */
  since: number;
  /** People in my graph slice just before the join (me included), to tell how many came with the person. */
  before: number;
  set: (person: JoinedPerson, before: number) => void;
  clear: () => void;
};

/** How long a join is shown at most, even when the network never answers. */
export const JOIN_MAX_MS = 45_000;

export const useJoining = create<JoiningState>((set) => ({
  person: null,
  since: 0,
  before: 0,
  set: (person, before) => set({ person, before, since: Date.now() }),
  clear: () => set({ person: null, since: 0, before: 0 }),
}));

let lastAnnounced: string | null = null;

/** People in the cached graph slice (me included); 0 before it was ever read. */
export function sliceSize(utils: Utils): number {
  return utils.connection.graphSlice.getData()?.nodes.length ?? 0;
}

/**
 * A new direct connection was made. The Circle draws the person right away and plays the "joining" state
 * while the heavy graph slice of their network loads; the load starts now, before the Circle is open.
 * Without `person` the newest connection is taken from the server.
 */
export async function announceJoin(utils: Utils, person?: JoinedPerson, sliceBefore?: number): Promise<void> {
  const before = sliceBefore ?? sliceSize(utils);
  let who = person ?? null;
  if (!who) {
    try {
      const list = await utils.connection.list.fetch();
      const newest = list[0];
      if (newest) who = { id: newest.userId, name: newest.displayName, photoUrl: newest.photoUrl ?? null };
    } catch {
      who = null;
    }
  }
  if (!who) return;
  // Found from the server side again (the count poll after a join made here): already told
  if (!person && who.id === lastAnnounced) return;
  lastAnnounced = who.id;
  useJoining.getState().set(who, before);
  void utils.connection.graphSlice.prefetch().catch(() => undefined);
  void utils.connection.list.prefetch().catch(() => undefined);
}
