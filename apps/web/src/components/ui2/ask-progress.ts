import { useEffect, useState } from 'react';

/**
 * Fractions toward the request gate: first ring / 5, and reachable network / 10.
 * Both must reach 1 before the request tab leaves its quiet state.
 * WP4 calls setAskProgress from network stats. Until then the tab stays open.
 */
export const ASK_CIRCLE_GOAL = 5;
export const ASK_NETWORK_GOAL = 10;

export type AskProgress = { circle: number; network: number };

const OPEN: AskProgress = { circle: 1, network: 1 };

let current: AskProgress = OPEN;
const listeners = new Set<(value: AskProgress) => void>();

export function setAskProgress(next: AskProgress) {
  current = {
    circle: clamp(next.circle),
    network: clamp(next.network),
  };
  listeners.forEach((listener) => listener(current));
}

export function useAskProgress(): AskProgress {
  const [value, setValue] = useState(current);
  useEffect(() => {
    listeners.add(setValue);
    setValue(current);
    return () => {
      listeners.delete(setValue);
    };
  }, []);
  return value;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** The ring shows the smaller of the two shares. Ready when both are full. */
export function askRing(progress: AskProgress): { ready: boolean; ratio: number } {
  const ratio = Math.min(progress.circle, progress.network);
  return { ready: progress.circle >= 1 && progress.network >= 1, ratio };
}
