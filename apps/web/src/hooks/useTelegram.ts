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
  const scheme = getTGColorScheme();
  useTheme.getState().setMode(scheme);
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

    if (!isAuthenticated) {
      const initData = getTGInitData();
      if (initData) {
        loginMutation
          .mutateAsync({ initData })
          .then((result) => {
            login(result.accessToken, result.refreshToken, result.userId);
            setIsReady(true);
          })
          .catch(() => {
            setIsReady(true);
          });
      } else {
        setIsReady(true);
      }
    } else {
      syncTelegramTheme();
      setIsReady(true);
    }

    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { isReady, isTelegram: isTelegramWebApp() };
}

const ROOT_PATHS = ['/', '/welcome', '/login'];

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
