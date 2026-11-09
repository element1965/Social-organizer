import { create } from 'zustand';
import type { GraphView } from './CircleGraph';

export type Ring = 1 | 2 | 3;

const HIDDEN_KEY = 'so.circle.hiddenRings';

function readHidden(): Ring[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is Ring => value === 1 || value === 2 || value === 3);
  } catch {
    return [];
  }
}

function writeHidden(rings: Ring[]) {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify(rings));
  } catch {
    /* storage blocked: the choice lives for this session only */
  }
}

type CircleState = {
  /** Camera saved when the Circle unmounts; restored without the intro on return (screens.md §3). */
  view: GraphView | null;
  /** Person whose card was open, so "Back" from the Person screen lands on the same card. */
  selectedId: string | null;
  /** Highlighted path (ids from me to the selected person or to the active request). */
  highlightPath: string[];
  /** Rings hidden on the scene. Kept in localStorage, toggled from People. */
  hiddenRings: Ring[];
  saveView: (view: GraphView | null) => void;
  setSelected: (id: string | null) => void;
  setHighlightPath: (path: string[]) => void;
  setRingHidden: (ring: Ring, hidden: boolean) => void;
};

/** Circle state that survives unmounting the page (navigation to Person, Collection, People). */
export const useCircleStore = create<CircleState>((set) => ({
  view: null,
  selectedId: null,
  highlightPath: [],
  hiddenRings: readHidden(),
  saveView: (view) => set({ view }),
  setSelected: (selectedId) => set({ selectedId }),
  setHighlightPath: (highlightPath) => set({ highlightPath }),
  setRingHidden: (ring, hidden) =>
    set((state) => {
      const next = hidden
        ? Array.from(new Set([...state.hiddenRings, ring])).sort()
        : state.hiddenRings.filter((value) => value !== ring);
      writeHidden(next);
      return { hiddenRings: next };
    }),
}));
