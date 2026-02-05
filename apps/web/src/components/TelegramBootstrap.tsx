import { useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isTelegramWebApp, getStartParam } from '@so/tg-adapter';
import { useTelegramInit, useTelegramBackButton } from '../hooks/useTelegram';
import { useAuth } from '../hooks/useAuth';

export function TelegramBootstrap({ children }: { children: React.ReactNode }) {
  const { isReady, isTelegram } = useTelegramInit();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const startParamHandled = useRef(false);

  useTelegramBackButton();

  // After Telegram auto-auth, navigate based on start_param or redirect from public pages
  useEffect(() => {
    if (!isTelegram || !isReady || !isAuthenticated) return;

    // Check start_param or pending invite for deep linking (only once per session)
    if (!startParamHandled.current) {
      startParamHandled.current = true;

      // Priority 1: start_param from Telegram deep link
      const startParam = getStartParam();
      let inviteToken: string | null = null;
      if (startParam?.startsWith('invite_')) {
        inviteToken = startParam.slice('invite_'.length);
      }

      // Priority 2: pendingInviteToken saved in localStorage (from web invite flow → TG login)
      if (!inviteToken) {
        inviteToken = localStorage.getItem('pendingInviteToken');
      }

      if (inviteToken) {
        localStorage.removeItem('pendingInviteToken');
        navigate(`/invite/${inviteToken}`, { replace: true });
        return;
      }
    }

    // Default: redirect away from public pages
    if (location.pathname === '/welcome' || location.pathname === '/login') {
      navigate('/', { replace: true });
    }
  }, [isTelegram, isReady, isAuthenticated, location.pathname, navigate]);

  // Show spinner while Telegram auto-auth is in progress
  if (isTelegram && !isReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return <>{children}</>;
}
