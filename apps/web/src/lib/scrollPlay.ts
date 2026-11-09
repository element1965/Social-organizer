/*
 * Scroll-driven playback for the site and /how: figures play their sequence when they come into view,
 * sections and cards fade in once. Everything collapses to the final state under prefers-reduced-motion.
 * Port of docs/redesign/mockups/v2/scroll.js.
 */
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

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

/** Class set on elements prepared by `reveal`; style `.rv` as opacity 0 / translateY(18px) and `.rv.in` as shown. */
export const REVEAL_CLASS = 'rv';
export const REVEAL_IN_CLASS = 'in';

/**
 * Fade-in for sections and cards. Elements matching `sections` fade in once (threshold .15); children of
 * `groups` containers come in with an 80 ms stagger. Under reduced motion everything is shown at once.
 * Returns a cleanup function. The CSS for `.rv` / `.rv.in` lives with the site styles.
 * Only for static markup: it mutates DOM classes and will not see React re-renders; in React components
 * prefer `useScrollPlay` or `onEnter` in an effect.
 */
export function reveal(root: ParentNode = document, sel: { sections?: string; groups?: string } = {}): () => void {
  const sections = sel.sections ?? '.hero, .sec, .cta, .hero1';
  const groups = sel.groups ?? '.steps, .nots, .stores';
  const reduce = prefersReducedMotion();
  const offs: Array<() => void> = [];
  root.querySelectorAll<HTMLElement>(sections).forEach((el) => {
    el.classList.add(REVEAL_CLASS);
    if (reduce) el.classList.add(REVEAL_IN_CLASS);
    else offs.push(onEnter(el, () => el.classList.add(REVEAL_IN_CLASS), { threshold: 0.15 }));
  });
  root.querySelectorAll<HTMLElement>(groups).forEach((box) => {
    const kids = Array.from(box.children) as HTMLElement[];
    kids.forEach((k, i) => {
      k.classList.add(REVEAL_CLASS);
      k.style.transitionDelay = `${i * 80}ms`;
      if (reduce) k.classList.add(REVEAL_IN_CLASS);
    });
    if (!reduce) offs.push(onEnter(box, () => kids.forEach((k) => k.classList.add(REVEAL_IN_CLASS)), { threshold: 0.2 }));
  });
  return () => offs.forEach((f) => f());
}

export interface UseScrollPlayOptions extends OnEnterOptions {
  /** Delay between steps in ms. Default 900. */
  gap?: number;
}

/**
 * Plays `steps` when the element comes into view (on every return by default, like the figures on /how).
 * Returns `[ref, step, replay]`; `step` is the current step (the last one under reduced motion).
 * Usage: `const [ref, depth] = useScrollPlay<HTMLDivElement, number>([0, 1, 2], { gap: 900 });`
 */
export function useScrollPlay<E extends Element = HTMLDivElement, T = number>(
  steps: readonly T[],
  opts: UseScrollPlayOptions = {},
): [RefObject<E | null>, T, () => void] {
  const ref = useRef<E>(null);
  const [step, setStep] = useState<T>((prefersReducedMotion() ? steps[steps.length - 1] : steps[0]) as T);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const runnerRef = useRef<Seq | null>(null);
  const stepsKey = steps.map(String).join('|');
  const { gap = 900, threshold = 0.5, rootMargin, repeat = true } = opts;

  useEffect(() => {
    const runner = seq<T>(setStep, stepsRef.current, gap);
    runnerRef.current = runner;
    const off = onEnter(ref.current, () => runner.run(), { threshold, rootMargin, repeat });
    return () => {
      off();
      runner.cancel();
      runnerRef.current = null;
    };
  }, [stepsKey, gap, threshold, rootMargin, repeat]);

  const replay = useCallback(() => runnerRef.current?.run(), []);
  return [ref, step, replay];
}
