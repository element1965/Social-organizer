import { firstTouchCampaign } from '../lib/campaign';
import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  isTelegramWebApp,
  initTelegramWebApp,
  getTGInitData,
  showBackButton,
  hideBackButton,
  hapticImpact,
  hapticNotification,
  hapticSelection,
  onThemeChanged,
  setTGChromeColor,
} from '@so/tg-adapter';
import { useAuth } from './useAuth';
import { paintTelegramTheme } from './useTheme';
import { trpc } from '../lib/trpc';
import { markFirstRun } from '../components/onboarding/flow';
import i18n from 'i18next';

function syncTelegramTheme() {
  paintTelegramTheme();
  const canvas = getComputedStyle(document.documentElement).getPropertyValue('--so-canvas').trim();
  // The token is a space-separated RGB triplet; Telegram expects #RRGGBB.
  if (!/^\d{1,3} \d{1,3} \d{1,3}$/.test(canvas)) return;
  setTGChromeColor('#' + canvas.split(' ').map((channel) => Number(channel).toString(16).padStart(2, '0')).join(''));
}

export function useTelegramInit() {
  const [isReady, setIsReady] = useState(!isTelegramWebApp());
  /** Mini App sign-in did not work (rejected or missing initData) and there is no stored session. */
  const [failed, setFailed] = useState(false);
  const login = useAuth((s) => s.login);
  const loginMutation = trpc.auth.loginWithTelegram.useMutation({ meta: { notifyOnError: false } });
  const didRun = useRef(false);

  /** A visible failure (auth.html №15) only when nothing else can sign the person in. */
  const fail = () => {
    if (!localStorage.getItem('accessToken')) setFailed(true);
    setIsReady(true);
  };

  const attempt = () => {
    // Always refresh token from Telegram initData (previous JWT may be expired)
    const initData = getTGInitData();
    console.log('[TG Auth] initData present:', !!initData, 'length:', initData?.length ?? 0);
    if (initData) {
      loginMutation
        .mutateAsync({ initData, campaign: firstTouchCampaign() })
        .then((result) => {
          if (!result?.accessToken) {
            console.error('[TG Auth] login returned null/empty result');
            fail();
            return;
          }
          console.log('[TG Auth] login success, userId:', result.userId);
          // A Telegram account made just now goes through the same first run as on the web (TelegramBootstrap
          // routes it); marked before the session exists, so the routing effect already sees it
          if (result.isNew) markFirstRun(result.userId);
          login(result.accessToken, result.refreshToken, result.userId);
          // Result of "Connect Telegram" from the app settings (start_param link_CODE)
          const linkResult = (result as { linkResult?: string }).linkResult;
          if (linkResult) {
            const key = linkResult === 'conflict' ? 'settings.telegramLinkConflict'
              : linkResult === 'invalid' ? 'settings.telegramLinkInvalid'
              : linkResult === 'merged' ? 'settings.telegramLinkMerged'
              : 'settings.telegramConnected';
            const wa = (window as unknown as { Telegram?: { WebApp?: { showAlert?: (m: string) => void } } }).Telegram?.WebApp;
            const text = i18n.t(key);
            if (wa?.showAlert) wa.showAlert(text); else console.log('[TG Link]', text);
          }
          setFailed(false);
          setIsReady(true);
        })
        .catch((err) => {
          console.error('[TG Auth] loginWithTelegram failed:', err.message || err);
          // If re-auth failed but we have a stored token, still proceed; otherwise show the failure screen
          fail();
        });
    } else {
      console.warn('[TG Auth] no initData, skipping auto-login');
      fail();
    }
  };

  useEffect(() => {
    if (!isTelegramWebApp()) return;
    syncTelegramTheme();
    initTelegramWebApp();
    return onThemeChanged(syncTelegramTheme);
  }, []);

  useEffect(() => {
    if (!isTelegramWebApp() || didRun.current) return;
    didRun.current = true;
    attempt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    isReady,
    isTelegram: isTelegramWebApp(),
    failed,
    /** Try again with the same initData (the failure screen's main button). */
    retry: () => {
      setFailed(false);
      setIsReady(false);
      attempt();
    },
    /** The person chose e-mail instead: leave the failure screen. */
    dismiss: () => setFailed(false),
  };
}

const ROOT_PATHS = [
  '/',
  '/welcome',
  '/login',
  '/dashboard',
  '/ask',
  '/add',
  '/me',
  '/how',
  '/groups',
  '/get',
  '/privacy',
  '/terms',
  '/delete-account',
  '/dev/ui',
  '/arvut',
];

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
      const cb = () => {
        const idx = (window.history.state as { idx?: number } | null)?.idx;
        if (typeof idx === 'number' && idx > 0) navigate(-1);
        else navigate('/');
      };
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
