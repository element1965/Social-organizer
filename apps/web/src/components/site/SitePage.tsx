import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { useDocumentTitle } from './hooks';
import { SiteFooter } from './SiteFooter';
import { SiteHeader, type SiteSection } from './SiteHeader';
import './site.css';

/** Frame of every public page: header, content, footer on the light canvas (or dark by theme). */
export function SitePage({
  title,
  active,
  footer = true,
  className,
  children,
}: {
  /** Document title. */
  title: string;
  active?: SiteSection;
  footer?: boolean;
  className?: string;
  children: ReactNode;
}) {
  useDocumentTitle(title);
  return (
    <div className={cn('site', className)}>
      <div className="site-wrap flex flex-1 flex-col">
        <SiteHeader active={active} />
        <main id="main" className="flex flex-1 flex-col">
          {children}
        </main>
        {footer ? <SiteFooter /> : null}
      </div>
    </div>
  );
}
