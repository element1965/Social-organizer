import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from 'i18next';
import { Home, Bell, Users, Settings, HelpCircle } from 'lucide-react';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';
import { ChatAssistant } from './ChatAssistant';
import { SkillsPopup } from './SkillsPopup';
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
  const { data: unreadMatches } = trpc.matches.unreadMatchCount.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const { selection } = useTelegramHaptics();

  // Sync network graph to local Gun.js / IndexedDB backup
  useGraphSync();

  // Load skill translations from DB (single source of truth for all categories)
  const { data: skillCategories } = trpc.skills.categories.useQuery(undefined, { staleTime: 60000 });
  useEffect(() => {
    if (!skillCategories) return;
    let added = false;
    for (const cat of skillCategories) {
      const tr = cat.translations as Record<string, string> | null;
      if (!tr) continue;
      for (const [lang, text] of Object.entries(tr)) {
        if (text) {
          i18n.addResource(lang, 'translation', `skills.${cat.key}`, text);
          added = true;
        }
      }
    }
    if (added) i18n.emit('languageChanged', i18n.language);
  }, [skillCategories]);

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
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex flex-col max-w-md mx-auto relative">
      {/* Help button — absolute top-right, doesn't push content down */}
      {location.pathname !== '/dashboard' && (
        <button
          onClick={() => window.dispatchEvent(new CustomEvent('toggle-help-menu'))}
          className="absolute top-3 right-4 z-40 w-10 h-10 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center transition-colors shadow-lg"
        >
          <HelpCircle className="w-5 h-5 text-white" />
        </button>
      )}
      <main className="flex-1 pb-16 overflow-y-auto">
        <Outlet />
      </main>

      {/* AI Chat Assistant */}
      <ChatAssistant />
      <SkillsPopup />

      <nav className={cn("fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex justify-around items-center h-16 z-50", chatPanelOpen && "hidden")}>
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
                  'w-12 h-12 rounded-full flex items-center justify-center shadow-lg',
                  'bg-red-600 hover:bg-red-700 active:bg-red-800 transition-colors',
                  active && 'ring-2 ring-red-400 ring-offset-2 ring-offset-white dark:ring-offset-gray-900'
                )}>
                  <span className="text-white font-bold text-sm">SOS</span>
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
                active ? 'text-blue-600 dark:text-blue-400' : 'text-gray-500 dark:text-gray-300'
              )}
            >
              {item.icon && <item.icon className="w-5 h-5" />}
              {item.badge && (() => {
                const total = (unread?.count ?? 0) + (pendingIncoming?.count ?? 0) + (unreadMatches?.count ?? 0);
                return total > 0 ? (
                  <span className="absolute top-1 right-1/4 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
                    {total > 9 ? '9+' : total}
                  </span>
                ) : null;
              })()}
              <span className="text-[10px] mt-0.5">{t(item.labelKey)}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
