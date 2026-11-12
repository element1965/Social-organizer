import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { CrumbLink, MainBar, type Crumb } from './MainBar';
import { useShellMode, type ShellMode } from './shell-mode';

type ScreenProps = {
  title?: string;
  back?: Crumb;
  action?: ReactNode;
  /** Center a 680px column from 1024. Phone and tablet stay full width. */
  width?: 'full' | 'column';
  /** Override the live shell. The gallery uses this to show both headers. */
  shell?: ShellMode;
  /**
   * Viewport column under the safe areas. The header keeps its own height and
   * children get the rest, so a thread can be `flex-1 min-h-0` without a rem fudge.
   */
  fill?: boolean;
  children: ReactNode;
  className?: string;
};

export function Screen({ title, back, action, width = 'full', children, className, shell, fill = false }: ScreenProps) {
  const live = useShellMode();
  const mode = shell ?? live;
  const desktop = mode === 'sidebar';
  const showHeader = Boolean(title || back || action);

  return (
    <div
      className={cn(
        fill ? 'flex h-[calc(100dvh-var(--sa-top)-var(--sa-bottom))] flex-col' : 'min-h-full',
        'text-ink',
        className,
      )}
    >
      {showHeader && desktop ? <MainBar back={back} title={title} action={action} column={width === 'column'} /> : null}
      {showHeader && !desktop ? (
        <div className="relative sticky top-[var(--sa-top)] z-20 flex h-12 items-center bg-canvas px-2">
          {back ? <CrumbLink crumb={back} size="lg" /> : <span />}
          {title ? (
            <h1 className="pointer-events-none absolute inset-x-24 truncate text-center text-body-l font-bold">{title}</h1>
          ) : null}
          {action ? <div className="ml-auto flex items-center">{action}</div> : null}
        </div>
      ) : null}
      <div
        className={cn(
          // Each route mounts its own Screen, so this plays once per screen change
          'so-screen-in px-4 pb-6',
          fill && 'flex min-h-0 flex-1 flex-col',
          width === 'column' && desktop && 'mx-auto w-full max-w-[680px]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
