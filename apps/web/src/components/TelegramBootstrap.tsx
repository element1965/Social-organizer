import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { isTelegramWebApp, getStartParam } from '@so/tg-adapter';
import { useTelegramInit, useTelegramBackButton } from '../hooks/useTelegram';
import { useAuth } from '../hooks/useAuth';

// Temporary debug: log to screen for Telegram WebView debugging
function useDebugLog() {
  const [logs, setLogs] = useState<string[]>([]);
  const add = (msg: string) => {
    console.log('[TG-DBG]', msg);
    setLogs((prev) => [...prev, `${new Date().toISOString().slice(11, 19)} ${msg}`]);
  };
  return { logs, add };
}

export function TelegramBootstrap({ children }: { children: React.ReactNode }) {
  const { isReady, isTelegram } = useTelegramInit();
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const navigate = useNavigate();
  const location = useLocation();
  const startParamHandled = useRef(false);
  const debug = useDebugLog();

  useTelegramBackButton();

  // Log initial state on mount
  useEffect(() => {
    const raw = window.Telegram?.WebApp?.initDataUnsafe;
    debug.add(`isTG=${isTelegram} ready=${isReady} auth=${isAuthenticated}`);
    debug.add(`start_param=${raw?.start_param ?? 'NONE'}`);
    debug.add(`getStartParam()=${getStartParam() ?? 'NULL'}`);
    debug.add(`path=${location.pathname}`);
    debug.add(`pendingInvite=${localStorage.getItem('pendingInviteToken') ?? 'NONE'}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // After Telegram auto-auth, navigate based on start_param or redirect from public pages
  useEffect(() => {
    debug.add(`effect: isTG=${isTelegram} ready=${isReady} auth=${isAuthenticated} path=${location.pathname}`);
    if (!isTelegram || !isReady || !isAuthenticated) return;

    // Check start_param or pending invite for deep linking (only once per session)
    if (!startParamHandled.current) {
      startParamHandled.current = true;

      // Priority 1: start_param from Telegram deep link
      const startParam = getStartParam();
      debug.add(`startParam=${startParam ?? 'NULL'}`);
      let inviteToken: string | null = null;
      if (startParam?.startsWith('collection_')) {
        const collectionId = startParam.slice('collection_'.length);
        navigate(`/collection/${collectionId}`, { replace: true });
        return;
      }

      if (startParam?.startsWith('invite_')) {
        inviteToken = startParam.slice('invite_'.length);
        debug.add(`invite token from start_param: ${inviteToken.slice(0, 8)}...`);
      }

      // Priority 2: pendingInviteToken saved in localStorage (from web invite flow → TG login)
      if (!inviteToken) {
        inviteToken = localStorage.getItem('pendingInviteToken');
        if (inviteToken) debug.add(`invite token from localStorage: ${inviteToken.slice(0, 8)}...`);
      }

      if (inviteToken) {
        // Save token so landing page and invite page can use it
        localStorage.setItem('pendingInviteToken', inviteToken);
        debug.add(`navigating to /welcome?invite=${inviteToken.slice(0, 8)}...`);
        navigate(`/welcome?invite=${inviteToken}`, { replace: true });
        return;
      }

      debug.add('no invite token found');
    }

    // Default: redirect away from public pages (but NOT if there's a pending invite)
    if (location.pathname === '/welcome' || location.pathname === '/login') {
      const hasPendingInvite = localStorage.getItem('pendingInviteToken');
      if (!hasPendingInvite) {
        debug.add(`redirecting from ${location.pathname} to /`);
        navigate('/', { replace: true });
      } else {
        debug.add(`staying on ${location.pathname} (has pending invite)`);
      }
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

  return (
    <>
      {/* Temporary debug overlay — remove after fixing invite flow */}
      {isTelegram && debug.logs.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-[9999] bg-black/90 text-green-400 text-[10px] font-mono p-2 max-h-40 overflow-y-auto">
          {debug.logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
        </div>
      )}
      {children}
    </>
  );
}
