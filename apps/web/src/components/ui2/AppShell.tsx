import type { ReactNode } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { useGraphSync } from '../../hooks/useGraphSync';
import { useTelegramHaptics } from '../../hooks/useTelegram';
import { useTheme } from '../../hooks/useTheme';
import { AskMark } from './AskMark';
import { BrandMark } from './BrandMark';
import { Avatar } from './Avatar';
import { BannerProvider } from './Banner';
import { useAskProgress, type AskProgress } from './ask-progress';
import {
  IconAdd,
  IconCircle,
  IconHelp,
  IconMoon,
  IconPeople,
  IconPerson,
  IconSun,
} from './icons';
import { Segmented } from './Segmented';
import { isPushPath, shellSection, useShellMode, type ShellMode, type ShellSection } from './shell-mode';

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
  unread?: number;
  user: ShellUser;
  theme: ThemeChoice;
  onTheme: (mode: ThemeChoice) => void;
  /** Gallery frames stay in place and do not follow links. */
  interactive?: boolean;
  /** Draw inside a preview frame instead of the viewport. */
  contained?: boolean;
};

const THEME_ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

function nextTheme(mode: ThemeChoice): ThemeChoice {
  const index = THEME_ORDER.indexOf(mode);
  return THEME_ORDER[(index + 1) % THEME_ORDER.length] ?? 'system';
}

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
  theme,
  onTheme,
  interactive = true,
  contained = false,
}: ShellChromeProps) {
  const { t } = useTranslation();
  const { selection } = useTelegramHaptics();
  const activate = () => {
    if (interactive) selection();
  };
  const rail = mode === 'rail';
  const badge = mode === 'sidebar' ? badgeLabel(unread) : null;
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
    const tab = (to: string, label: string, active: boolean, icon: ReactNode) => {
      const className = cn(
        'so-focus flex h-full flex-1 flex-col items-center justify-center gap-1 text-tab font-bold',
        active ? 'text-care' : 'text-ink-subtle',
      );
      const inner = (
        <>
          {icon}
          <span>{label}</span>
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
          {tab('/', t('nav.circle'), section === 'circle', <IconCircle className="h-6 w-6" />)}
          {tab('/ask', t('nav.ask'), section === 'ask', <AskMark progress={ask} />)}
          {tab('/add', t('nav.add'), section === 'add', <IconAdd className="h-6 w-6" />)}
          {tab('/me', t('nav.profile'), section === 'profile', <IconPerson className="h-6 w-6" />)}
        </div>
      </nav>
    );
  }

  const addClass = cn(
    'so-focus mt-3.5 flex items-center justify-center gap-2 rounded-md bg-ink font-bold text-canvas',
    rail ? 'h-[52px] w-[52px]' : 'h-11 w-full text-body-s',
    section === 'add' && 'outline outline-2 outline-offset-2 outline-care',
  );
  const addInner = (
    <>
      <IconAdd className="h-5 w-5" />
      {rail ? null : t('nav.addPerson')}
    </>
  );
  const themeOptions: { value: ThemeChoice; label: string }[] = [
    { value: 'system', label: t('common.themeAuto') },
    { value: 'light', label: t('common.themeLight') },
    { value: 'dark', label: t('common.themeDark') },
  ];

  return (
    <aside
      className={cn(
        'flex shrink-0 flex-col border-r border-line-soft bg-surface',
        rail ? 'w-[76px] items-center px-2.5 py-4' : 'w-[240px] px-3 pb-4 pt-5',
        contained ? 'h-full' : 'sticky top-[var(--sa-top)] h-[calc(100dvh-var(--sa-top))]',
      )}
    >
      {interactive ? (
        <Link to="/" onClick={activate} className={cn('so-focus flex items-center gap-2.5 rounded-md', rail ? 'pb-4' : 'px-2.5 pb-[18px] pt-1')}>
          <ShellBrandMark rail={rail} />
          {rail ? null : <span className="text-body-s font-extrabold tracking-tight">{t('common.appName')}</span>}
        </Link>
      ) : (
        <div className={cn('flex items-center gap-2.5', rail ? 'pb-4' : 'px-2.5 pb-[18px] pt-1')}>
          <ShellBrandMark rail={rail} />
          {rail ? null : <span className="text-body-s font-extrabold tracking-tight">{t('common.appName')}</span>}
        </div>
      )}
      <nav aria-label={t('nav.main')} className={cn('flex flex-col gap-0.5', rail && 'items-center')}>
        {circle}
        {people}
        {askItem}
        {profile}
      </nav>
      {interactive ? (
        <Link to="/add" aria-label={t('nav.addPerson')} className={addClass} onClick={activate}>
          {addInner}
        </Link>
      ) : (
        <button type="button" aria-label={t('nav.addPerson')} className={addClass}>
          {addInner}
        </button>
      )}
      <div className={cn('mt-auto flex flex-col gap-0.5', rail ? 'items-center' : 'pt-4')}>
        <NavItem to="/me/help" label={t('nav.help')} active={helpCurrent} rail={rail} interactive={interactive} onActivate={activate}>
          <IconHelp className="h-[22px] w-[22px]" />
        </NavItem>
        {rail ? (
          <button
            type="button"
            aria-label={t('nav.theme')}
            title={t('nav.theme')}
            onClick={() => onTheme(nextTheme(theme))}
            className="so-focus group relative grid h-[52px] w-[52px] place-items-center rounded-md text-ink-muted hover:text-ink"
          >
            {theme === 'dark' ? <IconSun className="h-[22px] w-[22px]" /> : <IconMoon className="h-[22px] w-[22px]" />}
            <span className="pointer-events-none absolute left-[calc(100%+8px)] top-1/2 z-30 -translate-y-1/2 whitespace-nowrap rounded-sm bg-ink px-2 py-1 text-micro font-bold text-canvas opacity-0 group-hover:opacity-100">
              {t('nav.theme')}
            </span>
          </button>
        ) : (
          <div className="px-1 py-2">
            <Segmented
              variant="inline"
              label={t('nav.theme')}
              value={theme}
              onChange={onTheme}
              options={themeOptions}
              className="max-w-full"
            />
          </div>
        )}
        {interactive ? (
          <Link
            to="/me"
            onClick={activate}
            aria-label={rail ? user.name || t('nav.profile') : undefined}
            className={cn('so-focus flex items-center gap-2.5 rounded-md', rail ? 'p-1' : 'min-w-0 px-3 py-2.5')}
          >
            <UserFace user={user} compact={rail} />
          </Link>
        ) : (
          <div className={cn('flex items-center gap-2.5 rounded-md', rail ? 'p-1' : 'min-w-0 px-3 py-2.5')}>
            <UserFace user={user} compact={rail} />
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
  const { data: unread } = trpc.notification.unreadCount.useQuery(undefined, { refetchInterval: 30_000 });
  const { data: me } = trpc.user.me.useQuery();
  const showTabs = mode === 'tabs' && !isPushPath(location.pathname);
  const user: ShellUser = {
    name: me?.name ?? '',
    email: me?.email ?? null,
    photoUrl: me?.photoUrl ?? null,
  };

  return (
    <div data-shell={mode} className="flex min-h-[calc(100dvh-var(--sa-top))] bg-canvas text-ink">
      {mode === 'tabs' ? null : (
        <ShellChrome
          mode={mode}
          section={shellSection(location.pathname)}
          pathname={location.pathname}
          ask={ask}
          unread={unread?.count ?? 0}
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
          unread={unread?.count ?? 0}
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
  useGraphSync();
  return (
    <BannerProvider>
      <LiveShell />
    </BannerProvider>
  );
}
