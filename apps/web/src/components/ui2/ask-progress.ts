import { useEffect, useState } from 'react';

/**
 * Fractions toward the request gate: first ring / 5, and reachable network / 10.
 * Both must reach 1 before the request tab leaves its quiet state.
 * AskProgressSync (mounted in the signed-in shell) feeds it from collection.askAccess.
 */
export const ASK_CIRCLE_GOAL = 5;
export const ASK_NETWORK_GOAL = 10;

export type AskProgress = { circle: number; network: number };

/**
 * Before the server answers, the tab shows the last value this user saw (kept per user), or the quiet state.
 * Starting "open" made the hand red on every app start until the Need screen was visited.
 */
const QUIET: AskProgress = { circle: 0, network: 0 };
const STORE_KEY = 'so.askProgress';

function storedUserId(): string | null {
  try {
    return localStorage.getItem('userId');
  } catch {
    return null;
  }
}

function readCached(): AskProgress | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: string; circle?: number; network?: number };
    if (!saved.userId || saved.userId !== storedUserId()) return null;
    return { circle: clamp(Number(saved.circle)), network: clamp(Number(saved.network)) };
  } catch {
    return null;
  }
}

function writeCached(value: AskProgress) {
  const userId = storedUserId();
  if (!userId) return;
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ userId, ...value }));
  } catch {
    // storage may be unavailable (private mode); the server value still applies for this session
  }
}

let current: AskProgress = readCached() ?? QUIET;
const listeners = new Set<(value: AskProgress) => void>();

export function setAskProgress(next: AskProgress) {
  current = {
    circle: clamp(next.circle),
    network: clamp(next.network),
  };
  writeCached(current);
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
