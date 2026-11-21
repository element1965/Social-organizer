import { useEffect, type ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { flushPendingSettings } from '../../lib/pendingSettings';
import { useAuth } from '../../hooks/useAuth';
import { cn } from '../../lib/utils';
import { useStoredFontScale } from '../profile/fontScale';
import { useGraphSync } from '../../hooks/useGraphSync';
import { useTelegramHaptics } from '../../hooks/useTelegram';
import { useTheme } from '../../hooks/useTheme';
import { useCircleAttention } from '../../hooks/useCircleAttention';
import { usePulse } from '../../hooks/usePulse';
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

type NavCurrent = 'page' | 'location' | undefined;

type ItemProps = {
  to: string;
  label: string;
  current: NavCurrent;
  rail: boolean;
  interactive: boolean;
  onActivate: () => void;
  children: ReactNode;
  badge?: string | null;
  state?: { fromCircle: true };
};

function NavItem({ to, label, current, rail, interactive, onActivate, children, badge, state }: ItemProps) {
  const className = cn(
    'so-focus group relative flex items-center gap-3 rounded-md text-body-s font-bold transition-colors duration-base ease-so motion-reduce:transition-none',
    rail ? 'h-[52px] w-[52px] justify-center' : 'h-11 px-3',
    current ? 'bg-care-soft text-care' : 'text-ink-muted hover:text-ink',
  );
  const inner = (
    <>
      <span className="grid h-[22px] w-[22px] place-items-center">{children}</span>
      {rail ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
      {!rail && badge ? (
        <span key={badge} className="so-pop grid h-[22px] min-w-[22px] place-items-center rounded-pill bg-sos px-1.5 text-micro font-bold tabular-nums text-sos-on">
          {badge}
        </span>
      ) : null}
      {rail ? (
        <span className="pointer-events-none absolute start-[calc(100%+8px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-micro font-bold text-canvas opacity-0 transition-opacity duration-fast ease-so group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
          {label}
        </span>
      ) : null}
    </>
  );
  if (!interactive) {
    return (
      <button type="button" className={className} aria-current={current} aria-label={rail ? label : undefined}>
        {inner}
      </button>
    );
  }
  return (
    <Link to={to} state={state} className={className} aria-current={current} aria-label={rail ? label : undefined} onClick={onActivate}>
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
  const navCurrent = (to: string, active: boolean): NavCurrent => {
    if (!active) return undefined;
    return pathname === to ? 'page' : 'location';
  };
  const helpCurrent = navCurrent('/me/help', pathname === '/me/help');
  const askActive = section === 'ask';
  const askState = pathname === '/' ? { fromCircle: true } as const : undefined;

  const circle = (
    <NavItem to="/" label={t('nav.circle')} current={navCurrent('/', section === 'circle')} rail={rail} interactive={interactive} onActivate={activate} badge={badge}>
      <IconCircle className="h-[22px] w-[22px]" />
    </NavItem>
  );
  const people = (
    <NavItem to="/people" label={t('nav.people')} current={navCurrent('/people', section === 'people')} rail={rail} interactive={interactive} onActivate={activate}>
      <IconPeople className="h-[22px] w-[22px]" />
    </NavItem>
  );
  const askItem = (
    <NavItem to="/ask" state={askState} label={t('nav.ask')} current={navCurrent('/ask', askActive)} rail={rail} interactive={interactive} onActivate={activate}>
      <AskMark progress={ask} active={askActive} />
    </NavItem>
  );
  const profile = (
    <NavItem to="/me" label={t('nav.profile')} current={navCurrent('/me', section === 'profile')} rail={rail} interactive={interactive} onActivate={activate}>
      <IconPerson className="h-[22px] w-[22px]" />
    </NavItem>
  );

  if (mode === 'tabs') {
    const tab = (to: string, label: string, active: boolean, icon: ReactNode, mark?: { count?: string | null }) => {
      const current = navCurrent(to, active);
      const className = cn(
        'so-focus flex h-full min-w-0 flex-1 flex-col items-center justify-center gap-1 pt-4 text-tab font-bold transition-colors duration-base ease-so motion-reduce:transition-none',
        active ? 'text-care' : 'text-ink-subtle',
      );
      // Fixed icon and label slots keep the icons aligned when a translated label wraps.
      const inner = (
        <>
          <span className={cn('relative grid h-[28px] w-[28px] place-items-center', active && 'so-tab-bump')}>
            {icon}
            {mark?.count ? (
              <span
                key={mark.count}
                className="so-pop absolute -end-2.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-pill bg-sos px-1 text-micro font-bold leading-none tabular-nums text-sos-on"
              >
                {mark.count}
              </span>
            ) : null}
          </span>
          <span className="block min-h-8 max-w-full break-words px-0.5 text-center leading-[16px]">{label}</span>
          {mark?.count ? <span className="sr-only">{t('nav.attention')}</span> : null}
        </>
      );
      if (!interactive) {
        return (
          <button key={to} type="button" aria-current={current} className={className}>
            {inner}
          </button>
        );
      }
      return (
        <Link key={to} to={to} state={to === '/ask' ? askState : undefined} aria-current={current} className={className} onClick={activate}>
          {inner}
        </Link>
      );
    };
    return (
      <nav
        aria-label={t('nav.main')}
        className={cn(
          'inset-x-0 bottom-0 z-40 border-t border-line-soft bg-surface/[0.96] backdrop-blur-md',
          contained ? 'absolute' : 'fixed',
        )}
        style={{ height: 'var(--so-tab-bar-space)', paddingBottom: 'var(--sa-bottom)' }}
      >
        <div className="flex h-[var(--so-tab-bar-height)]">
          {tab('/', t('nav.circle'), section === 'circle', <IconCircle className="h-[24px] w-[24px]" />, { count: badge })}
          {tab('/ask', t('nav.ask'), askActive, <AskMark progress={ask} active={askActive} />)}
          {tab('/add', t('nav.add'), section === 'add', <IconAdd className="h-[24px] w-[24px]" />)}
          {tab('/me', t('nav.profile'), section === 'profile', <IconPerson className="h-[24px] w-[24px]" />)}
        </div>
      </nav>
    );
  }

  const addItem = (
    <NavItem to="/add" label={t('nav.add')} current={navCurrent('/add', section === 'add')} rail={rail} interactive={interactive} onActivate={activate}>
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
        <NavItem to="/me/help" label={t('nav.help')} current={helpCurrent} rail={rail} interactive={interactive} onActivate={activate}>
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

/** Display preferences whose save failed earlier (lib/pendingSettings.ts) are sent again once the app starts signed in. */
function usePendingSettingsSync() {
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  useEffect(() => {
    void flushPendingSettings(utils.client, userId);
  }, [utils, userId]);
}

function LiveShell({ children }: { children?: ReactNode }) {
  const mode = useShellMode();
  const location = useLocation();
  const theme = useTheme((state) => state.mode);
  const setMode = useTheme((state) => state.setMode);
  // The ring belongs to the signed-in account only (another account's value is never shown)
  const ask = useAskProgress(useAuth((s) => s.userId));
  // One light poll keeps the badge and every list fresh (hooks/usePulse.ts): no timer per query
  usePulse();
  const waiting = useCircleAttention() ?? 0;
  const { data: me } = trpc.user.me.useQuery();
  const showTabs = mode === 'tabs' && !hidesTabBar(location.pathname);
  const user: ShellUser = {
    name: me?.name ?? '',
    email: me?.email ?? null,
    photoUrl: me?.photoUrl ?? null,
  };

  return (
    <div data-shell={mode} data-tab-bar={showTabs || undefined} className="flex min-h-[calc(100dvh-var(--sa-top))] bg-canvas text-ink">
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
        style={{ paddingBottom: showTabs ? 'var(--so-tab-bar-space)' : 'var(--sa-bottom)' }}
      >
        {children ?? <Outlet />}
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

/**
 * Authenticated application frame. Replaces the old phone-column Layout. Renders the route outlet, or
 * `children` where it is used outside a layout route (the not-found screen).
 */
export function AppShell({ children }: { children?: ReactNode }) {
  useStoredFontScale();
  useGraphSync();
  usePendingSettingsSync();
  return (
    <BannerProvider>
      <LiveShell>{children}</LiveShell>
    </BannerProvider>
  );
}
