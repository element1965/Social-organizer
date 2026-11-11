import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { useStoredFontScale } from '../profile/fontScale';
import { useGraphSync } from '../../hooks/useGraphSync';
import { useTelegramHaptics } from '../../hooks/useTelegram';
import { useTheme } from '../../hooks/useTheme';
import { useAcceptedRecent } from '../../hooks/useAcceptedRecent';
import { AskMark } from './AskMark';
import { BrandMark } from './BrandMark';
import { Avatar } from './Avatar';
import { BannerProvider } from './Banner';
import { useAskProgress, type AskProgress } from './ask-progress';
import { AskProgressSync } from '../collection/AskProgressSync';
import {
  IconAdd,
  IconCircle,
  IconHelp,
  IconPeople,
  IconPerson,
} from './icons';
import { hidesTabBar, shellSection, useShellMode, type ShellMode, type ShellSection } from './shell-mode';

export type ThemeChoice = 'light' | 'dark' | 'system';

export type ShellUser = {
  name: string;
  email: string | null;
  photoUrl?: string | null;
};

type ShellChromeProps = {
  mode: ShellMode;
  section: ShellSection | null;
  pathname?: string;
  ask: AskProgress;
  /** What waits for the person on the Circle: Needs to decide, requests to confirm, fresh confirmations. */
  unread?: number;
  user: ShellUser;
  theme: ThemeChoice;
  onTheme: (mode: ThemeChoice) => void;
  /** Gallery frames stay in place and do not follow links. */
  interactive?: boolean;
  /** Draw inside a preview frame instead of the viewport. */
  contained?: boolean;
};

function badgeLabel(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? '9+' : String(count);
}

type ItemProps = {
  to: string;
  label: string;
  active: boolean;
  rail: boolean;
  interactive: boolean;
  onActivate: () => void;
  children: ReactNode;
  badge?: string | null;
};

function NavItem({ to, label, active, rail, interactive, onActivate, children, badge }: ItemProps) {
  const className = cn(
    'so-focus group relative flex items-center gap-3 rounded-md text-body-s font-bold',
    rail ? 'h-[52px] w-[52px] justify-center' : 'h-11 px-3',
    active ? 'bg-care-soft text-care' : 'text-ink-muted hover:text-ink',
  );
  const inner = (
    <>
      <span className="grid h-[22px] w-[22px] place-items-center">{children}</span>
      {rail ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!rail && badge ? (
        <span className="grid h-[22px] min-w-[22px] place-items-center rounded-pill bg-sos px-1.5 text-micro font-bold tabular-nums text-sos-on">
          {badge}
        </span>
      ) : null}
      {rail ? (
        <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-micro font-bold text-canvas opacity-0 group-hover:opacity-100 group-focus-within:opacity-100">
          {label}
        </span>
      ) : null}
    </>
  );
  if (!interactive) {
    return (
      <button type="button" className={className} aria-current={active ? 'page' : undefined} aria-label={rail ? label : undefined}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to} className={className} aria-current={active ? 'page' : undefined} aria-label={rail ? label : undefined} onClick={onActivate}>
      {inner}
    </Link>
  );
}

/** Tab bar, rail, or sidebar. The live shell and the gallery both use this. */
export function ShellChrome({
  mode,
  section,
  pathname = '/',
  ask,
  unread = 0,
  user,
  interactive = true,
  contained = false,
}: ShellChromeProps) {
  const { t } = useTranslation();
  const { selection } = useTelegramHaptics();
  const activate = () => {
    if (interactive) selection();
  };
  // Tablet ('rail' layout mode) also gets the labelled sidebar, only narrower (product decision 2026-11-09).
  const compact = mode === 'rail';
  const rail = false;
  const badge = badgeLabel(unread);
  const helpCurrent = pathname === '/me/help';

  const circle = (
    <NavItem to="/" label={t('nav.circle')} active={section === 'circle'} rail={rail} interactive={interactive} onActivate={activate} badge={badge}>
      <IconCircle className="h-[22px] w-[22px]" />
    </NavItem>
  );
  const people = (
    <NavItem to="/people" label={t('nav.people')} active={section === 'people'} rail={rail} interactive={interactive} onActivate={activate}>
      <IconPeople className="h-[22px] w-[22px]" />
    </NavItem>
  );
  const askItem = (
    <NavItem to="/ask" label={t('nav.ask')} active={section === 'ask'} rail={rail} interactive={interactive} onActivate={activate}>
      <AskMark progress={ask} />
    </NavItem>
  );
  const profile = (
    <NavItem to="/me" label={t('nav.profile')} active={section === 'profile'} rail={rail} interactive={interactive} onActivate={activate}>
      <IconPerson className="h-[22px] w-[22px]" />
    </NavItem>
  );

  if (mode === 'tabs') {
    const tab = (to: string, label: string, active: boolean, icon: ReactNode, mark?: { count?: string | null }) => {
      const className = cn(
        'so-focus flex h-full flex-1 flex-col items-center justify-center gap-1 text-tab font-bold',
        active ? 'text-care' : 'text-ink-subtle',
      );
      // Every icon sits in the same 28 px box and the label has a fixed line, so the labels line up
      // whatever the icon (the Ask tile is larger than the line icons)
      const inner = (
        <>
          <span className="relative grid h-[28px] w-[28px] place-items-center">
            {icon}
            {mark?.count ? (
              <span className="absolute -right-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-sos px-1 text-micro font-bold leading-none tabular-nums text-sos-on">
                {mark.count}
              </span>
            ) : null}
          </span>
          <span className="block whitespace-nowrap leading-[16px]">{label}</span>
          {mark?.count ? <span className="sr-only">{t('nav.attention')}</span> : null}
        </>
      );
      if (!interactive) {
        return (
          <button key={to} type="button" role="tab" aria-selected={active} className={className}>
            {inner}
          </button>
        );
      }
      return (
        <Link key={to} to={to} role="tab" aria-selected={active} className={className} onClick={activate}>
          {inner}
        </Link>
      );
    };
    return (
      <nav
        role="tablist"
        aria-label={t('nav.main')}
        className={cn(
          'inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/[0.96] backdrop-blur-md',
          contained ? 'absolute' : 'fixed',
        )}
        style={{ height: 'calc(84px + var(--sa-bottom))', paddingBottom: 'var(--sa-bottom)' }}
      >
        <div className="flex h-[84px]">
          {tab('/', t('nav.circle'), section === 'circle', <IconCircle className="h-[24px] w-[24px]" />, { count: badge })}
          {tab('/ask', t('nav.ask'), section === 'ask', <AskMark progress={ask} />)}
          {tab('/add', t('nav.add'), section === 'add', <IconAdd className="h-[24px] w-[24px]" />)}
          {tab('/me', t('nav.profile'), section === 'profile', <IconPerson className="h-[24px] w-[24px]" />)}
        </div>
      </nav>
    );
  }

  const addItem = (
    <NavItem to="/add" label={t('nav.add')} active={section === 'add'} rail={rail} interactive={interactive} onActivate={activate}>
      <IconAdd className="h-[22px] w-[22px]" />
    </NavItem>
  );

  return (
    <aside
      className={cn(
        // z-40 keeps the shell above page content; the column always fits the viewport and scrolls inside if needed
        'relative z-40 flex min-h-0 shrink-0 flex-col overflow-y-auto overscroll-contain border-r border-line-soft bg-surface',
        compact ? 'w-[200px] px-2.5 pb-3 pt-4' : 'w-[240px] px-3 pb-4 pt-5',
        contained ? 'h-full' : 'sticky top-[var(--sa-top)] h-[calc(100dvh-var(--sa-top))]',
      )}
    >
      {interactive ? (
        <Link to="/" onClick={activate} className="so-focus flex shrink-0 items-center gap-2.5 rounded-md px-2.5 pb-[18px] pt-1">
          <ShellBrandMark rail={false} />
          <span className="truncate text-body-s font-extrabold tracking-tight">{t('common.appName')}</span>
        </Link>
      ) : (
        <div className="flex shrink-0 items-center gap-2.5 px-2.5 pb-[18px] pt-1">
          <ShellBrandMark rail={false} />
          <span className="truncate text-body-s font-extrabold tracking-tight">{t('common.appName')}</span>
        </div>
      )}
      {/* Same destinations as the phone tab bar, plus People */}
      <nav aria-label={t('nav.main')} className="flex flex-col gap-0.5">
        {circle}
        {people}
        {askItem}
        {addItem}
        {profile}
      </nav>
      <div className="mt-auto flex shrink-0 flex-col gap-0.5 pt-4">
        <NavItem to="/me/help" label={t('nav.help')} active={helpCurrent} rail={rail} interactive={interactive} onActivate={activate}>
          <IconHelp className="h-[22px] w-[22px]" />
        </NavItem>
        {interactive ? (
          <Link to="/me" onClick={activate} className="so-focus flex min-w-0 items-center gap-2.5 rounded-md px-3 py-2.5">
            <UserFace user={user} />
          </Link>
        ) : (
          <div className="flex min-w-0 items-center gap-2.5 rounded-md px-3 py-2.5">
            <UserFace user={user} />
          </div>
        )}
      </div>
    </aside>
  );
}

function ShellBrandMark({ rail }: { rail: boolean }) {
  return <BrandMark size={rail ? 32 : 28} />;
}

function UserFace({ user, compact }: { user: ShellUser; compact?: boolean }) {
  const name = user.name.trim() || '?';
  return (
    <>
      <Avatar name={name} src={user.photoUrl} size={36} className="h-[34px] w-[34px] rounded-[11px] text-micro" />
      {compact ? null : (
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-bold leading-tight tracking-tight">{name === '?' ? '' : name}</span>
          {user.email ? <span className="block truncate text-micro font-semibold text-ink-muted">{user.email}</span> : null}
        </span>
      )}
    </>
  );
}

function LiveShell() {
  const mode = useShellMode();
  const location = useLocation();
  const theme = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  const ask = useAskProgress();
  const { data: attention } = trpc.notification.attention.useQuery(undefined, { refetchInterval: 30_000 });
  const accepted = useAcceptedRecent();
  const waiting = (attention?.needs ?? 0) + (attention?.incoming ?? 0) + accepted.unseen;
  const { data: me } = trpc.user.me.useQuery();
  const showTabs = mode === 'tabs' && !hidesTabBar(location.pathname);
  const user: ShellUser = {
    name: me?.name ?? '',
    email: me?.email ?? null,
    photoUrl: me?.photoUrl ?? null,
  };

  return (
    <div data-shell={mode} className="flex min-h-[calc(100dvh-var(--sa-top))] bg-canvas text-ink">
      {/* The Need tab reads this on every screen, so the shell keeps it fresh, not only the Need pages. */}
      <AskProgressSync />
      {mode === 'tabs' ? null : (
        <ShellChrome
          mode={mode}
          section={shellSection(location.pathname)}
          pathname={location.pathname}
          ask={ask}
          unread={waiting}
          user={user}
          theme={theme}
          onTheme={setMode}
        />
      )}
      <div
        className="min-w-0 flex-1"
        style={{ paddingBottom: showTabs ? 'calc(84px + var(--sa-bottom))' : 'var(--sa-bottom)' }}
      >
        <Outlet />
      </div>
      {showTabs ? (
        <ShellChrome
          mode="tabs"
          section={shellSection(location.pathname)}
          pathname={location.pathname}
          ask={ask}
          unread={waiting}
          user={user}
          theme={theme}
          onTheme={setMode}
        />
      ) : null}
    </div>
  );
}

/** Authenticated application frame. Replaces the old phone-column Layout. */
export function AppShell() {
  useStoredFontScale();
  useGraphSync();
  return (
    <BannerProvider>
      <LiveShell />
    </BannerProvider>
  );
}
