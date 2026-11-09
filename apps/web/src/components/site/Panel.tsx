import type { ReactNode } from 'react';
import { Capacitor } from '@capacitor/core';
import { isTelegramWebApp } from '@so/tg-adapter';
import { cn } from '../../lib/utils';
import { useMediaQuery } from './hooks';
import { SitePage } from './SitePage';

/** From this width sign-in, invite and the public collection sit in a 460 px panel under the site header. */
export const PANEL_QUERY = '(min-width: 1024px)';

/**
 * True when `Panel` wraps its content in the site frame: a browser (not the native app, not the Telegram Mini App)
 * at 1024 px or wider. Pages can use it to drop their own phone chrome (full-screen background, back button).
 */
export function useSitePanel(): boolean {
  const wide = useMediaQuery(PANEL_QUERY);
  return wide && !Capacitor.isNativePlatform() && !isTelegramWebApp();
}

/**
 * Desktop wrapper for `/login`, `/invite/:token` and `/sos/:id` (screens.md §17, site.html №2–4).
 * From 1024 px: site header + a centred 460 px panel on the canvas (`surface`, radius 30, padding 32/32/28).
 * Below 1024 px, in the native app and inside Telegram it renders `children` unchanged — the phone layout
 * belongs to the page (WP7, WP4).
 *
 * `variant="pubcard"` centres the content (invite, public collection); `form` is left-aligned (sign-in).
 */
export function Panel({
  title,
  variant = 'form',
  className,
  children,
}: {
  /** Document title while the panel is shown. */
  title?: string;
  variant?: 'form' | 'pubcard';
  className?: string;
  children: ReactNode;
}) {
  const wide = useSitePanel();
  if (!wide) return <>{children}</>;
  return (
    <SitePage title={title ?? document.title} footer={false}>
      <div className="site-centre">
        <section className={cn('site-panel', variant === 'pubcard' && 'pubcard', className)}>{children}</section>
      </div>
    </SitePage>
  );
}
