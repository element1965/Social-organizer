import { useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isTelegramWebApp } from '@so/tg-adapter';
import { useTelegramInit, useTelegramBackButton } from '../hooks/useTelegram';
import { useAuth } from '../hooks/useAuth';

export function TelegramBootstrap({ children }: { children: React.ReactNode }) {
  const { isReady, isTelegram } = useTelegramInit();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();

  useTelegramBackButton();

  // Redirect away from public pages after Telegram auto-auth
  useEffect(() => {
    if (!isTelegram || !isReady || !isAuthenticated) return;
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
