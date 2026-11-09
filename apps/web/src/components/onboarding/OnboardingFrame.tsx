/*
 * One vertical grid for every full-screen onboarding step (screens.md §12):
 * top row, a picture of a fixed height, 24 to the title, 10 to the text, at least 32 to the buttons,
 * buttons pinned to the bottom. On a phone it fills the screen; from 768 px (outside the native app and
 * Telegram) the same content sits in a 460 px Panel centred on the canvas, as on the website.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Panel, useShellMode } from '../ui2';
import { BrandMark } from '../ui2/BrandMark';
import { IconBack } from '../ui2/icons';
import { cn } from '../../lib/utils';
import { languageNames } from '@so/i18n/languages';
import { trpc } from '../../lib/trpc';
import { useAuth } from '../../hooks/useAuth';

/** True when the step is drawn inside the desktop panel rather than full screen. */
export function usePanelLayout(): boolean {
  return useShellMode() !== 'tabs';
}

export function OnboardingFrame({
  top,
  corner,
  centre = false,
  middle = false,
  children,
  foot,
  className,
}: {
  /** The top row: brand line or a back link. */
  top?: ReactNode;
  /** Absolutely placed in the top-right corner: language or "Skip". */
  corner?: ReactNode;
  centre?: boolean;
  /** Phone only: centre the content vertically (form steps), so fields and buttons are within thumb reach. */
  middle?: boolean;
  children: ReactNode;
  /** Bottom block: buttons. Pinned to the bottom on a phone. */
  foot?: ReactNode;
  className?: string;
}) {
  const panel = usePanelLayout();
  const body = (
    <>
      {top ? <div className="flex h-[26px] items-center">{top}</div> : null}
      {corner ? <div className={cn('absolute right-4 z-10', panel ? 'right-6 top-6' : 'top-[18px]')}>{corner}</div> : null}
      <div
        className={cn(
          'flex flex-col',
          centre && 'items-center text-center',
          // Bottom padding equal to the top row keeps the block at the true centre of the screen
          middle && !panel && 'flex-1 justify-center pb-[26px]',
        )}
      >
        {children}
      </div>
      {foot ? <div className="mt-auto w-full pt-8">{foot}</div> : null}
    </>
  );

  if (panel) {
    return (
      <main className="grid min-h-[100dvh] place-items-center bg-canvas px-4 py-12 text-ink">
        <Panel className={cn('relative flex flex-col', className)}>{body}</Panel>
      </main>
    );
  }
  return (
    <main
      className={cn(
        'relative flex min-h-[calc(100dvh-var(--sa-top))] flex-col bg-canvas px-5 pt-[26px] text-ink',
        'pb-[calc(var(--sa-bottom)+28px)]',
        className,
      )}
    >
      {body}
    </main>
  );
}

/** Brand line: the mark and the name. */
export function BrandLine() {
  const { t } = useTranslation();
  return (
    <span className="flex items-center gap-2 text-body-s font-extrabold tracking-tight">
      <BrandMark size={26} />
      {t('common.appName')}
    </span>
  );
}

/** "‹ Back" in the top row of pushed steps (e-mail, code, password). */
export function BackLink({ label, onClick, to }: { label: string; onClick?: () => void; to?: string }) {
  const cls = 'so-focus -ml-1.5 inline-flex min-h-11 items-center gap-0.5 text-body-l font-bold tracking-tight text-care';
  const icon = <IconBack className="h-[22px] w-[22px]" />;
  if (to) {
    return (
      <Link to={to} className={cls}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {icon}
      {label}
    </button>
  );
}

/** Language switch in the corner: a native select dressed as the "RU" chip. */
export function LanguageCorner() {
  const { t, i18n } = useTranslation();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const updateLanguage = trpc.settings.updateLanguage.useMutation();
  const current = (i18n.resolvedLanguage || i18n.language || 'en').slice(0, 2);
  return (
    <label className="relative grid h-10 min-w-10 place-items-center rounded-md border border-line bg-surface px-3 text-caption font-bold uppercase text-ink-muted">
      {current}
      <select
        aria-label={t('login.language')}
        value={current}
        onChange={(event) => {
          const lang = event.target.value;
          void i18n.changeLanguage(lang);
          try {
            localStorage.setItem('language', lang);
          } catch {
            /* storage blocked */
          }
          if (isAuthenticated) updateLanguage.mutate({ language: lang });
        }}
        className="absolute inset-0 cursor-pointer appearance-none opacity-0"
      >
        {Object.entries(languageNames).map(([code, name]) => (
          <option key={code} value={code}>
            {name}
          </option>
        ))}
      </select>
    </label>
  );
}

/** Title and one sentence, on the shared rhythm (24 above the title, 10 to the text). */
export function StepText({ title, children, centre = false }: { title: ReactNode; children?: ReactNode; centre?: boolean }) {
  return (
    <>
      <h1 className="mt-6 text-h2 font-bold [text-wrap:balance]">{title}</h1>
      {children ? (
        <p className={cn('mt-2.5 max-w-[32ch] text-body-s text-ink-muted [&_b]:font-bold [&_b]:text-ink', centre && 'max-w-[30ch]')}>
          {children}
        </p>
      ) : null}
    </>
  );
}
