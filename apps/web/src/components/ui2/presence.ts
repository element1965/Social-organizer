import { useEffect, useState } from 'react';

/** True when the system asks for reduced motion: exits then happen at once. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Keeps an element mounted for its exit animation. `mounted` stays true for `ms` after `open` turns false, and
 * `leaving` is true during that time, so the element can play its exit class before it unmounts.
 */
export function usePresence(open: boolean, ms = 200): { mounted: boolean; leaving: boolean } {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    if (prefersReducedMotion()) {
      setMounted(false);
      return;
    }
    const timer = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(timer);
  }, [open, ms]);
  return { mounted: open || mounted, leaving: !open && mounted };
}

/**
 * Plays a short exit before an action that removes something from the screen (dismissing a card or a row).
 * `start(fn)` marks the item as leaving and runs `fn` once the exit is over.
 */
export function useExit(ms = 240): { leaving: boolean; start: (done: () => void) => void } {
  const [leaving, setLeaving] = useState(false);
  const start = (done: () => void) => {
    if (prefersReducedMotion()) {
      done();
      return;
    }
    setLeaving(true);
    window.setTimeout(done, ms);
  };
  return { leaving, start };
}
