import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  isTelegramWebApp,
  initTelegramWebApp,
  getTGInitData,
  getTGColorScheme,
  showBackButton,
  hideBackButton,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  onThemeChanged,
} from '@so/tg-adapter';
import { useAuth } from './useAuth';
import { useTheme } from './useTheme';
import { trpc } from '../lib/trpc';

function syncTelegramTheme() {
  // Re-apply current theme mode (only affects "system" mode which follows Telegram)
  const { mode, setMode } = useTheme.getState();
  setMode(mode);
}

export function useTelegramInit() {
  const [isReady, setIsReady] = useState(!isTelegramWebApp());
  const login = useAuth((s) => s.login);
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const loginMutation = trpc.auth.loginWithTelegram.useMutation();
  const didRun = useRef(false);

  useEffect(() => {
    if (!isTelegramWebApp() || didRun.current) return;
    didRun.current = true;

    initTelegramWebApp();
    syncTelegramTheme();
    const unsub = onThemeChanged(syncTelegramTheme);

    // Always refresh token from Telegram initData (previous JWT may be expired)
    const initData = getTGInitData();
    console.log('[TG Auth] initData present:', !!initData, 'length:', initData?.length ?? 0);
    if (initData) {
      loginMutation
        .mutateAsync({ initData })
        .then((result) => {
          if (!result?.accessToken) {
            console.error('[TG Auth] login returned null/empty result');
            setIsReady(true);
            return;
          }
          console.log('[TG Auth] login success, userId:', result.userId);
          login(result.accessToken, result.refreshToken, result.userId);
          setIsReady(true);
        })
        .catch((err) => {
          console.error('[TG Auth] loginWithTelegram failed:', err.message || err);
          console.error('[TG Auth] full error:', JSON.stringify(err));
          // If re-auth failed but we have a stored token, still proceed
          setIsReady(true);
        });
    } else {
      console.warn('[TG Auth] no initData, skipping auto-login');
      setIsReady(true);
    }

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isReady, isTelegram: isTelegramWebApp() };
}

const ROOT_PATHS = ['/', '/welcome', '/login', '/dashboard'];

export function useTelegramBackButton() {
  const navigate = useNavigate();
  const location = useLocation();
  const callbackRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!isTelegramWebApp()) return;

    const isRoot = ROOT_PATHS.includes(location.pathname);

    if (callbackRef.current) {
      hideBackButton(callbackRef.current);
      callbackRef.current = null;
    }

    if (!isRoot) {
      const cb = () => navigate(-1);
      callbackRef.current = cb;
      showBackButton(cb);
    }

    return () => {
      if (callbackRef.current) {
        hideBackButton(callbackRef.current);
        callbackRef.current = null;
      }
    };
  }, [location.pathname, navigate]);
}

export function useTelegramHaptics() {
  return {
    impact: useCallback((style?: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft') => {
      if (isTelegramWebApp()) hapticImpact(style);
    }, []),
    notification: useCallback((type?: 'error' | 'success' | 'warning') => {
      if (isTelegramWebApp()) hapticNotification(type);
    }, []),
    selection: useCallback(() => {
      if (isTelegramWebApp()) hapticSelection();
    }, []),
  };
}
