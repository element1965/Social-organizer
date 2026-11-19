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
 * Before the server answers, the tab shows the last value this account saw (kept per account), or the quiet
 * state. Starting "open" made the hand red on every app start until the Need screen was visited. A value is
 * valid only for the account it belongs to: after a switch (here or in another tab) the ring is quiet until
 * the new account's gate answers, also offline.
 */
const QUIET: AskProgress = { circle: 0, network: 0 };
const STORE_KEY = 'so.askProgress';

type Owned = { account: string; value: AskProgress };

function readCached(): Owned | null {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as { userId?: string; circle?: number; network?: number };
    if (!saved.userId) return null;
    return { account: saved.userId, value: { circle: clamp(Number(saved.circle)), network: clamp(Number(saved.network)) } };
  } catch {
    return null;
  }
}

function writeCached(owned: Owned) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ userId: owned.account, ...owned.value }));
  } catch {
    // storage may be unavailable (private mode); the server value still applies for this session
  }
}

let current: Owned | null = readCached();
const listeners = new Set<(value: Owned | null) => void>();

/** The ring's value from the gate answer of `account` (the account the gate query was asked for). */
export function setAskProgress(next: AskProgress, account: string) {
  current = { account, value: { circle: clamp(next.circle), network: clamp(next.network) } };
  writeCached(current);
  listeners.forEach((listener) => listener(current));
}

/** The ring for the signed-in `account`: its own last value, or quiet; never another account's. */
export function useAskProgress(account: string | null): AskProgress {
  const [owned, setOwned] = useState(current);
  useEffect(() => {
    listeners.add(setOwned);
    setOwned(current);
    return () => {
      listeners.delete(setOwned);
    };
  }, []);
  return account && owned?.account === account ? owned.value : QUIET;
}

function clamp(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * A threshold step as shown ("network 7 of 10", the tab ring): complete exactly when the server says the
 * threshold is met (`met`, decided on the exact count), otherwise never at or above the goal, so a rounded
 * count cannot show a step done while it is not, nor short while it is.
 */
export function stepValue(count: number, goal: number, met: boolean | undefined): number {
  if (met === true) return goal;
  if (met === false) return Math.max(0, Math.min(count, goal - 1));
  return Math.min(count, goal);
}

/** The ring shows the smaller of the two shares. Ready when both are full. */
export function askRing(progress: AskProgress): { ready: boolean; ratio: number } {
  const ratio = Math.min(progress.circle, progress.network);
  return { ready: progress.circle >= 1 && progress.network >= 1, ratio };
}
