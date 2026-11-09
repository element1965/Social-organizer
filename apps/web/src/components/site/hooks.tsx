import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { onEnter, prefersReducedMotion, seq } from '../../lib/scrollPlay';
import { cn } from '../../lib/utils';

/** Reactive `matchMedia`. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;
  const [match, setMatch] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** Phone width of the site (the container query in site.css folds at 600 px; the site is full width). */
export function useSitePhone(): boolean {
  return useMediaQuery('(max-width: 600px)');
}

/** The neutral title and description from index.html; every page restores them when it leaves. */
export const BASE_TITLE = 'Social Organizer';
const BASE_DESCRIPTION =
  typeof document === 'undefined' ? '' : document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

/**
 * Sets the document title (and optionally the meta description) while the page is shown, and puts the neutral
 * ones back on leave, so app routes never inherit a site page's title.
 */
export function useDocumentTitle(title: string, description?: string) {
  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (description && meta) meta.setAttribute('content', description);
    return () => {
      document.title = BASE_TITLE;
      if (description && meta) meta.setAttribute('content', BASE_DESCRIPTION);
    };
  }, [title, description]);
}

/**
 * Fade-in once when the element comes into view (threshold .15), as `reveal()` in lib/scrollPlay.ts does for static
 * markup. `group` staggers the children by 80 ms instead of moving the block itself.
 */
export function Reveal({
  as: Tag = 'div',
  group,
  className,
  children,
  ...rest
}: {
  as?: ElementType;
  group?: boolean;
  className?: string;
  children?: ReactNode;
  id?: string;
  'aria-labelledby'?: string;
}) {
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(prefersReducedMotion);
  useEffect(() => {
    if (shown) return;
    return onEnter(ref.current, () => setShown(true), { threshold: group ? 0.2 : 0.15 });
  }, [shown, group]);
  return (
    <Tag ref={ref} className={cn(className, group ? 'rvg' : 'rv', shown && 'in')} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Plays `steps` through `set` every time half of the element is on screen (figures on the site and /how).
 * The caller keeps the state, so clicks can still move the figure between plays.
 */
export function usePlayOnEnter<T>(set: (step: T) => void, steps: readonly T[], gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const setRef = useRef(set);
  setRef.current = set;
  const key = steps.map(String).join('|');
  useEffect(() => {
    const runner = seq<T>((k) => setRef.current(k), steps, gap);
    const off = onEnter(ref.current, () => runner.run(), { threshold: 0.5, repeat: true });
    return () => {
      off();
      runner.cancel();
    };
    // `steps` is compared by value through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gap]);
  return ref;
}
