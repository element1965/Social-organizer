import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { prefersReducedMotion } from './presence';

export type BannerContent = {
  kicker?: string;
  title: string;
  body?: string;
  icon?: ReactNode;
};

type BannerProps = BannerContent & {
  onClose?: () => void;
  /** Milliseconds before it leaves on its own. 0 keeps it. The countdown waits while it is hovered or focused. */
  duration?: number;
  /** Draw inside the parent instead of fixed to the viewport. */
  inline?: boolean;
  /** care: an event (default). sos: something did not go through; read out at once and never cut short. */
  tone?: 'care' | 'sos';
  /** Label of a close button; without it the banner leaves by itself or by a swipe up. */
  closeLabel?: string;
};

const iconTone = {
  care: 'bg-care-soft text-care',
  sos: 'bg-sos-soft text-sos',
};

export function Banner({
  kicker,
  title,
  body,
  icon,
  onClose,
  duration = 5000,
  inline = false,
  tone = 'care',
  closeLabel,
}: BannerProps) {
  const start = useRef<number | null>(null);
  const [gone, setGone] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // A finger (or the mouse) on it and keyboard focus inside it hold the countdown independently
  const [pointerHeld, setPointerHeld] = useState(false);
  const [focusHeld, setFocusHeld] = useState(false);
  const held = pointerHeld || focusHeld;
  // What is left of the countdown: a hold pauses it, letting go resumes it (never a fresh full duration)
  const remaining = useRef(duration);
  // Screen readers announce a live region when its text changes, not when it arrives with the text already
  // in it: the region mounts empty and the words follow a moment later. Focus stays where the person is.
  const [spoken, setSpoken] = useState(false);
  // A failure message is read in full: never cut to one line
  const wrap = tone === 'sos';

  // Slides up and fades before it unmounts (at once with reduced motion)
  const close = useCallback(() => {
    if (prefersReducedMotion()) {
      setGone(true);
      onClose?.();
      return;
    }
    setLeaving(true);
    window.setTimeout(() => {
      setGone(true);
      onClose?.();
    }, 200);
  }, [onClose]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSpoken(true), 150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (duration <= 0 || held) return;
    const startedAt = Date.now();
    const timer = window.setTimeout(close, Math.max(0, remaining.current));
    return () => {
      window.clearTimeout(timer);
      remaining.current -= Date.now() - startedAt;
    };
  }, [close, duration, held]);

  if (gone) return null;

  return (
    <div
      className={cn(
        leaving ? 'so-banner-out pointer-events-none' : 'so-banner-in',
        // A failure stays visible above an open sheet (z-50) as well
        tone === 'sos' ? 'z-[60]' : 'z-40',
        inline ? 'relative' : 'fixed inset-x-4 top-[calc(12px+var(--sa-top))] mx-auto max-w-md',
      )}
      onPointerDown={(event) => {
        start.current = event.clientY;
      }}
      onPointerUp={(event) => {
        if (start.current != null && start.current - event.clientY > 36) close();
        start.current = null;
      }}
      onPointerEnter={() => setPointerHeld(true)}
      onPointerLeave={() => setPointerHeld(false)}
      onFocus={() => setFocusHeld(true)}
      onBlur={(event) => {
        // Focus moving between elements inside the banner keeps the hold
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocusHeld(false);
      }}
    >
      <div
        role={tone === 'sos' ? 'alert' : 'status'}
        aria-live={tone === 'sos' ? 'assertive' : 'polite'}
        aria-atomic="true"
        className="sr-only"
      >
        {spoken ? (
          <>
            {kicker ? <span>{`${kicker} `}</span> : null}
            <span>{title}</span>
            {body ? <span>{` ${body}`}</span> : null}
          </>
        ) : null}
      </div>
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3 text-ink shadow-banner">
        {icon ? (
          <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-md', iconTone[tone])} aria-hidden>{icon}</span>
        ) : null}
        {/* The words are read from the live region above; this copy is for the eyes only */}
        <span className="min-w-0 flex-1" aria-hidden>
          {kicker ? <span className="block text-micro font-bold text-ink-muted">{kicker}</span> : null}
          <span className={cn('block text-body font-body', !wrap && 'truncate')}>{title}</span>
          {body ? <span className={cn('mt-0.5 block text-label font-semibold text-ink-muted', !wrap && 'truncate')}>{body}</span> : null}
        </span>
        {closeLabel ? (
          <button
            type="button"
            aria-label={closeLabel}
            onClick={close}
            className="so-focus -my-1 -me-1 grid h-11 w-11 shrink-0 place-items-center rounded-md text-ink-muted hover:text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" aria-hidden>
              <path d="M7 7l10 10M17 7 7 17" />
            </svg>
          </button>
        ) : null}
      </div>
    </div>
  );
}

type BannerContextValue = { show: (banner: BannerContent) => void };

const BannerContext = createContext<BannerContextValue | null>(null);

export function BannerProvider({ children }: { children: ReactNode }) {
  const [banner, setBanner] = useState<(BannerContent & { id: number }) | null>(null);
  const show = useCallback((next: BannerContent) => {
    setBanner({ ...next, id: Date.now() });
  }, []);
  return (
    <BannerContext.Provider value={{ show }}>
      {children}
      {banner ? <Banner key={banner.id} {...banner} onClose={() => setBanner(null)} /> : null}
    </BannerContext.Provider>
  );
}

export function useBanner(): BannerContextValue {
  const ctx = useContext(BannerContext);
  if (!ctx) return { show: () => undefined };
  return ctx;
}
