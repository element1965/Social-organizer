/*
 * Scroll-driven playback for the site and /how: figures play their sequence when they come into view,
 * sections and cards fade in once. Everything collapses to the final state under prefers-reduced-motion.
 * Port of docs/redesign/mockups/v2/scroll.js.
 */
import { useEffect, useState } from 'react';

const REDUCE_QUERY = '(prefers-reduced-motion: reduce)';

/** True when the user asked for reduced motion. Safe on the server and in old browsers. */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCE_QUERY).matches;
}

/** Reactive version of `prefersReducedMotion`. */
export function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(REDUCE_QUERY);
    const on = () => setReduce(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return reduce;
}

export interface OnEnterOptions {
  /** Share of the element that must be visible (0..1). Default .5. */
  threshold?: number;
  rootMargin?: string;
  /** Fire on every entry instead of once. */
  repeat?: boolean;
}

/** Call `cb` when at least `threshold` of `el` is visible. Returns a cleanup function. */
export function onEnter(
  el: Element | null | undefined,
  cb: (entry?: IntersectionObserverEntry) => void,
  opts: OnEnterOptions = {},
): () => void {
  if (!el || typeof IntersectionObserver === 'undefined') {
    cb();
    return () => {};
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          cb(e);
          if (!opts.repeat) io.unobserve(el);
        }
      }
    },
    { threshold: opts.threshold ?? 0.5, rootMargin: opts.rootMargin ?? '0px' },
  );
  io.observe(el);
  return () => io.disconnect();
}

export interface Seq {
  /** Restart the sequence (cancels the previous run); under reduced motion jumps to the last step. */
  run: () => void;
  cancel: () => void;
}

/** A sequence of steps with a gap (ms) between them. */
export function seq<T>(fn: (step: T) => void, steps: readonly T[], gap: number): Seq {
  let timers: ReturnType<typeof setTimeout>[] = [];
  const cancel = () => {
    timers.forEach(clearTimeout);
    timers = [];
  };
  const run = () => {
    cancel();
    if (steps.length === 0) return;
    if (prefersReducedMotion()) {
      fn(steps[steps.length - 1]!);
      return;
    }
    timers = steps.map((k, i) => setTimeout(() => fn(k), i * gap));
  };
  return { run, cancel };
}
