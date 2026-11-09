import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type BannerContent = {
  kicker?: string;
  title: string;
  body?: string;
  icon?: ReactNode;
};

type BannerProps = BannerContent & {
  onClose?: () => void;
  /** Milliseconds before it leaves on its own. 0 keeps it. */
  duration?: number;
  /** Draw inside the parent instead of fixed to the viewport. */
  inline?: boolean;
};

export function Banner({ kicker, title, body, icon, onClose, duration = 5000, inline = false }: BannerProps) {
  const start = useRef<number | null>(null);
  const [gone, setGone] = useState(false);

  const close = useCallback(() => {
    setGone(true);
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (duration <= 0) return;
    const timer = window.setTimeout(close, duration);
    return () => window.clearTimeout(timer);
  }, [close, duration]);

  if (gone) return null;

  return (
    <div
      className={cn(
        'so-banner-in z-40',
        inline ? 'relative' : 'fixed inset-x-4 top-[calc(12px+var(--sa-top))] mx-auto max-w-md',
      )}
      onPointerDown={(event) => {
        start.current = event.clientY;
      }}
      onPointerUp={(event) => {
        if (start.current != null && start.current - event.clientY > 36) close();
        start.current = null;
      }}
    >
      <div className="flex items-center gap-3 rounded-xl bg-surface p-3 text-ink shadow-banner">
        {icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-care-soft text-care">{icon}</span>
        ) : null}
        <span className="min-w-0">
          {kicker ? <span className="block text-micro font-bold text-ink-muted">{kicker}</span> : null}
          <span className="block truncate text-body font-body">{title}</span>
          {body ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{body}</span> : null}
        </span>
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
