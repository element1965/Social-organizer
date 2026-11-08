import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Home, Bell, Users, Settings, HelpCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';
import { ChatAssistant } from './ChatAssistant';
import { useGraphSync } from '../hooks/useGraphSync';
import { isTelegramWebApp, getTGThemeParams, onThemeChanged } from '@so/tg-adapter';
import { useTelegramHaptics } from '../hooks/useTelegram';

const navItems = [
  { path: '/dashboard', icon: Home, labelKey: 'nav.home' },
  { path: '/notifications', icon: Bell, labelKey: 'nav.notifications', badge: true },
  { path: '/create', icon: null, labelKey: 'nav.sos', sos: true },
  { path: '/network', icon: Users, labelKey: 'nav.network' },
  { path: '/settings', icon: Settings, labelKey: 'nav.settings' },
];

function injectTelegramCSSVars() {
  if (!isTelegramWebApp()) return;
  const params = getTGThemeParams();
  const root = document.documentElement;
  if (params.bgColor) root.style.setProperty('--tg-bg-color', params.bgColor);
  if (params.textColor) root.style.setProperty('--tg-text-color', params.textColor);
  if (params.hintColor) root.style.setProperty('--tg-hint-color', params.hintColor);
  if (params.linkColor) root.style.setProperty('--tg-link-color', params.linkColor);
  if (params.buttonColor) root.style.setProperty('--tg-button-color', params.buttonColor);
  if (params.buttonTextColor) root.style.setProperty('--tg-button-text-color', params.buttonTextColor);
  if (params.secondaryBgColor) root.style.setProperty('--tg-secondary-bg-color', params.secondaryBgColor);
  if (params.headerBgColor) root.style.setProperty('--tg-header-bg-color', params.headerBgColor);
}

export function Layout() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: unread } = trpc.notification.unreadCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { data: pendingIncoming } = trpc.pending.incomingCount.useQuery(undefined, {
    refetchInterval: 15000,
  });
  const { selection } = useTelegramHaptics();

  // Sync network graph to local Gun.js / IndexedDB backup
  useGraphSync();


  // Hide bottom nav when chat panel is open
  const [chatPanelOpen, setChatPanelOpen] = useState(false);
  useEffect(() => {
    const handler = (e: Event) => setChatPanelOpen((e as CustomEvent).detail);
    window.addEventListener('chat-panel-toggle', handler);
    return () => window.removeEventListener('chat-panel-toggle', handler);
  }, []);

  useEffect(() => {
    if (!isTelegramWebApp()) return;
    injectTelegramCSSVars();
    return onThemeChanged(injectTelegramCSSVars);
  }, []);

  return (
    <div className="min-h-[calc(100vh-var(--sa-top))] bg-canvas text-ink flex flex-col max-w-md mx-auto relative">
      {/* Help button — absolute top-right, doesn't push content down */}
      {location.pathname !== '/dashboard' && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-help-menu'))}
          aria-label={t('nav.help', 'Help')}
          className="absolute top-3 right-4 z-40 w-10 h-10 rounded-full bg-surface border border-line text-link hover:bg-surface-2 flex items-center justify-center transition-colors"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      )}
      <main className="flex-1 overflow-y-auto" style={{ paddingBottom: 'calc(4rem + var(--sa-bottom))' }}>
        <Outlet />
      </main>

      {/* AI Chat Assistant */}
      <ChatAssistant />

      <nav className={cn("fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-surface border-t border-line flex justify-around items-center z-50", chatPanelOpen && "hidden")} style={{ height: 'calc(4rem + var(--sa-bottom))', paddingBottom: 'var(--sa-bottom)' }}>
        {navItems.map((item) => {
          const active = location.pathname === item.path;
          if ((item as any).sos) {
            return (
              <button
                key={item.path}
                onClick={() => { selection(); navigate(item.path); }}
                className="flex flex-col items-center justify-center w-full h-full relative"
              >
                <div className={cn(
                  'w-12 h-12 rounded-full flex items-center justify-center',
                  'bg-sos hover:bg-sos-hover transition-colors',
                  active && 'ring-2 ring-sos/40 ring-offset-2 ring-offset-surface'
                )}>
                  <span className="text-sos-on font-bold text-sm">SOS</span>
                </div>
              </button>
            );
          }
          return (
            <button
              key={item.path}
              onClick={() => {
                selection();
                navigate(item.path);
              }}
              className={cn(
                'flex flex-col items-center justify-center w-full h-full relative',
                active ? 'text-ink' : 'text-ink-subtle hover:text-ink-muted'
              )}
            >
              {item.icon && <item.icon className="w-5 h-5" />}
              {item.badge && (() => {
                const total = (unread?.count ?? 0) + (pendingIncoming?.count ?? 0);
                return total > 0 ? (
                  <span className="absolute top-1 right-1/4 w-4 h-4 bg-sos text-sos-on text-[10px] rounded-full flex items-center justify-center">
                    {total > 9 ? '9+' : total}
                  </span>
                ) : null;
              })()}
              <span className={cn('text-[10px] mt-0.5', active && 'font-semibold')}>{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
