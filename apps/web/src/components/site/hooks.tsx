import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { onEnter, prefersReducedMotion, seq, type Seq } from '../../lib/scrollPlay';
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

/** People with connections in the network on the date in `join.now`. */
const NETWORK_NOW = 287;

interface PeopleObservation {
  count: number;
  observedAt: Date;
}

export function PeopleCount() {
  const { t, i18n } = useTranslation();
  const lang = i18n.resolvedLanguage || i18n.language || 'en';
  const [observation, setObservation] = useState<PeopleObservation>();
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/landing/people', { credentials: 'omit', signal: controller.signal })
      .then(async (response) => {
        const timestamp = response.headers.get('X-Observed-At');
        if (!response.ok || !timestamp) return;

        const observedAt = new Date(timestamp);
        if (!Number.isFinite(observedAt.getTime())) return;
        const count: unknown = await response.json();
        if (!controller.signal.aborted && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0) {
          setObservation({ count, observedAt });
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  const count = new Intl.NumberFormat(lang).format(observation?.count ?? NETWORK_NOW);
  return (
    <>
      <b>{count}</b>{' '}
      <span>
        {observation ? (
          <>
            {t('landing.v2.join.nowLive', { count: observation.count })}{' · '}
            <time dateTime={observation.observedAt.toISOString()}>
              {new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(observation.observedAt)}
            </time>
          </>
        ) : t('landing.v2.join.now')}
      </span>
    </>
  );
}

/** The description from index.html; every page restores it when it leaves. */
const BASE_DESCRIPTION =
  typeof document === 'undefined' ? '' : document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '';

/**
 * Sets the document title (and optionally the meta description) while the page is shown, and puts the neutral
 * ones back on leave, so app routes never inherit a site page's title.
 */
export function useDocumentTitle(title: string, description?: string) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = title;
    const meta = document.querySelector('meta[name="description"]');
    if (description && meta) meta.setAttribute('content', description);
    return () => {
      document.title = t('common.appName');
      if (description && meta) meta.setAttribute('content', BASE_DESCRIPTION);
    };
  }, [title, description, t]);
}

/**
 * Fade-in once as soon as any part of the element is 8% above the bottom of the screen. The threshold is 0, so a block
 * taller than the screen still shows (a ratio threshold on a tall block left the screen empty while scrolling).
 * `group` staggers the children by 80 ms instead of moving the block itself.
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
    return onEnter(ref.current, () => setShown(true), { threshold: 0, rootMargin: '0px 0px -8% 0px' });
  }, [shown]);
  return (
    <Tag ref={ref} className={cn(className, group ? 'rvg' : 'rv', shown && 'in')} {...rest}>
      {children}
    </Tag>
  );
}

/**
 * Plays `steps` through `set` every time half of the element is on screen (figures on /how).
 * `choose` is the manual control: the first call stops this run and every later one, so a reader's
 * pick is not replaced when the sequence ticks or the figure scrolls back in.
 */
export function usePlayOnEnter<T>(set: (step: T) => void, steps: readonly T[], gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const setRef = useRef(set);
  setRef.current = set;
  const runnerRef = useRef<Seq | null>(null);
  const held = useRef(false);
  const key = steps.map(String).join('|');
  useEffect(() => {
    const runner = seq<T>((k) => {
      if (!held.current) setRef.current(k);
    }, steps, gap);
    runnerRef.current = runner;
    const off = onEnter(ref.current, () => {
      if (!held.current) runner.run();
    }, { threshold: 0.5, repeat: true });
    return () => {
      off();
      runner.cancel();
      if (runnerRef.current === runner) runnerRef.current = null;
    };
    // `steps` is compared by value through `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, gap]);
  const choose = (step: T) => {
    held.current = true;
    runnerRef.current?.cancel();
    setRef.current(step);
  };
  return { ref, choose };
}
