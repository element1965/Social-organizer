import { create } from 'zustand';

const STORAGE_KEY = 'so.circle.graphAnimation';

function storedGraphAnimation() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'false';
  } catch {
    return true;
  }
}

type GraphAnimation = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
};

export const useGraphAnimation = create<GraphAnimation>((set) => ({
  enabled: storedGraphAnimation(),
  setEnabled: (enabled) => {
    set({ enabled });
    try {
      localStorage.setItem(STORAGE_KEY, String(enabled));
    } catch {
      // Keep the choice for this session if storage is unavailable.
    }
  },
}));
