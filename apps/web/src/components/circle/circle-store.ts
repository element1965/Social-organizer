import { create } from 'zustand';
import { useAuth } from '../../hooks/useAuth';
import type { GraphView } from '@so/graph-3d';

export type Ring = 1 | 2 | 3;

const hiddenKey = (userId: string) => `so.circle.hiddenRings:${userId}`;

function readHidden(userId: string | null): Ring[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(hiddenKey(userId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is Ring => value === 1 || value === 2 || value === 3);
  } catch {
    return [];
  }
}

function writeHidden(userId: string | null, rings: Ring[]) {
  if (!userId) return;
  try {
    localStorage.setItem(hiddenKey(userId), JSON.stringify(rings));
  } catch {
    /* storage blocked: the choice lives for this session only */
  }
}

type CircleState = {
  /** Account the state belongs to; a different sign-in resets everything. */
  userId: string | null;
  /** Camera saved when the Circle unmounts; restored without the intro on return (screens.md §3). */
  view: GraphView | null;
  /** Person whose card was open. */
  selectedId: string | null;
  /** Highlighted path (ids from me to the selected person or to the active request). */
  highlightPath: string[];
  /** Rings hidden on the scene. Kept in localStorage per account, toggled from People. */
  hiddenRings: Ring[];
  saveView: (view: GraphView | null) => void;
  setSelected: (id: string | null) => void;
  setHighlightPath: (path: string[]) => void;
  setRingHidden: (ring: Ring, hidden: boolean) => void;
};

function initial(userId: string | null) {
  return { userId, view: null, selectedId: null, highlightPath: [] as string[], hiddenRings: readHidden(userId) };
}

/** Circle state that survives unmounting the page (navigation to Person, Collection, People). */
export const useCircleStore = create<CircleState>((set) => ({
  ...initial(useAuth.getState().userId),
  saveView: (view) => set({ view }),
  setSelected: (selectedId) => set({ selectedId }),
  setHighlightPath: (highlightPath) => set({ highlightPath }),
  setRingHidden: (ring, hidden) =>
    set((state) => {
      const next = hidden
        ? Array.from(new Set([...state.hiddenRings, ring])).sort()
        : state.hiddenRings.filter((value) => value !== ring);
      writeHidden(state.userId, next);
      return { hiddenRings: next };
    }),
}));

// Sign-out or another account: drop the previous person's camera, selection and filters.
useAuth.subscribe((auth) => {
  if (auth.userId !== useCircleStore.getState().userId) useCircleStore.setState(initial(auth.userId));
});
