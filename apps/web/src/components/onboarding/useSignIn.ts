/*
 * Every sign-in path of the app in one hook, shared by the Login and Invite screens.
 * Ported one-to-one from the previous LoginPage: Google (GIS on desktop, full redirect on mobile browsers,
 * system browser + deep link in the native app), Apple (form_post via the backend, deep link in the app),
 * Telegram (mini-app initData, Login Widget on the website, otherwise the bot), e-mail code and the
 * legacy password form. Only the UI moved; the flows did not change.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { isTelegramWebApp, getTGInitData } from '@so/tg-adapter';
import { useAuth, markLoginMethod, type LoginMethod } from '../../hooks/useAuth';
import { trpc } from '../../lib/trpc';
import { takePendingSosPath } from '../../lib/inviteUrl';
import { AUTH_ORDER, detectDevice, type AuthProvider } from '../../lib/device';
import { afterSignInPath, readPendingInvite, safeInviteToken, safeMasked, safePath } from './flow';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_SERVICE_ID = import.meta.env.VITE_APPLE_SERVICE_ID as string | undefined;
export const RESEND_SECONDS = 60;

/** Telegram's login script (telegram-widget.js) adds Telegram.Login.auth, which opens the login popup. */
type TelegramLogin = {
  auth: (
    options: { bot_id: number; request_access?: 'write'; lang?: string },
    callback: (user: Record<string, unknown> | false) => void,
  ) => void;
};
function telegramLogin(): TelegramLogin | null {
  return (window as unknown as { Telegram?: { Login?: TelegramLogin } }).Telegram?.Login ?? null;
}

const TELEGRAM_LOGIN_SCRIPT = 'https://telegram.org/js/telegram-widget.js?22';

/** Loads Telegram's login script once, ahead of the click: the popup must open inside the click itself. */
function loadTelegramLogin() {
  if (typeof document === 'undefined' || document.getElementById('so-telegram-login')) return;
  const s = document.createElement('script');
  s.id = 'so-telegram-login';
  s.src = TELEGRAM_LOGIN_SCRIPT;
  s.async = true;
  document.head.appendChild(s);
}

/** "CODE:number" from the server → [code, number] */
function parseErr(message: string): [string, number | null] {
  const [code, n] = message.split(':');
  return [code ?? '', n != null && n !== '' ? Number(n) : null];
}

/** Reads user.me with a fresh token (the store is not signed in yet). Errors and timeouts count as onboarded. */
async function isOnboarded(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch('/trpc/user.me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    const body = (await res.json()) as { result?: { data?: { onboardingCompleted?: boolean } } };
    return body.result?.data?.onboardingCompleted !== false;
  } catch {
    return true;
  }
}

type Tokens = { accessToken: string; refreshToken: string; userId: string; isNew?: boolean };

export interface UseSignInOptions {
  /** Where to go after sign-in (overrides the pending invite). */
  redirect?: string | null;
  /** Called with the new step when the e-mail flow moves on (email → code). */
  onCodeSent?: () => void;
  /** The website opened the Telegram bot in a new tab (no widget, no Mini App). */
  onTelegramOpened?: () => void;
}

export function useSignIn({ redirect, onCodeSent, onTelegramOpened }: UseSignInOptions = {}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const login = useAuth((s) => s.login);
  const inTelegram = isTelegramWebApp();
  const { data: methods } = trpc.auth.methods.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // The invite survives every method: it stays in localStorage until InvitePage accepts it
  const pendingInviteToken = readPendingInvite();
  // Only same-origin relative paths are followed (?redirect= is user-controlled)
  const effectiveRedirect = safePath(redirect) || (pendingInviteToken ? `/invite/${pendingInviteToken}` : null);

  const [loading, setLoading] = useState(false);
  const [error, setErrorText] = useState('');
  /** Machine-readable reason of the current error (API code such as INVALID_CODE, or NETWORK). */
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [resendLeft, setResendLeft] = useState(0);
  /** TOO_MANY_CODES: no new code until this moment (ms since epoch). */
  const [blockedUntil, setBlockedUntil] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  /** Google/Apple brought an e-mail that belongs to an old password account (masked, may be empty). */
  const [linking, setLinking] = useState<{ masked: string | null } | null>(null);

  const setError = useCallback((text: string, code: string | null = null) => {
    setErrorText(text);
    setErrorCode(text ? code : null);
  }, []);

  // Resend countdown
  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendLeft]);

  // The "too many codes" wait is shown in minutes; tick every few seconds while it lasts
  useEffect(() => {
    if (blockedUntil <= now) return;
    const id = setTimeout(() => setNow(Date.now()), 5000);
    return () => clearTimeout(id);
  }, [blockedUntil, now]);
  const blockedLeft = Math.max(0, Math.ceil((blockedUntil - now) / 1000));

  /**
   * Finish a sign-in. First run is decided here from isNew (new accounts are created with
   * onboardingCompleted=true, so user.me cannot tell). Anything but home opens with a full page load:
   * fresh tRPC caches, and no race with TelegramBootstrap, which sends a signed-in person on /login to "/".
   */
  const onTokens = (method: LoginMethod | null) => async (data: Tokens) => {
    if (method) markLoginMethod(method);
    const target = effectiveRedirect || safePath(takePendingSosPath());
    // Old accounts that never finished onboarding get the first run too
    const isNew = !!data.isNew || !(await isOnboarded(data.accessToken));
    const path = afterSignInPath(isNew, target);
    login(data.accessToken, data.refreshToken, data.userId);
    if (path === '/') navigate('/', { replace: true });
    else window.location.href = path;
  };

  // ---- E-mail code ----
  const codeErrorText = (message: string): string => {
    const [c, n] = parseErr(message);
    switch (c) {
      case 'INVALID_CODE': return n != null ? t('signin.errInvalid', { count: n }) : t('signin.errInvalidNoCount');
      case 'CODE_EXPIRED': return t('signin.errExpired');
      case 'TOO_MANY_ATTEMPTS': return t('signin.errAttempts');
      case 'RESEND_TOO_SOON': return t('signin.errTooSoon', { sec: n ?? RESEND_SECONDS });
      case 'TOO_MANY_CODES': return t('login.errTooManyCodes', { min: Math.max(1, Math.ceil((n ?? 3600) / 60)) });
      case 'EMAIL_UNAVAILABLE': return t('signin.errUnavailable');
      default: return t('signin.errNetwork');
    }
  };
  const knownCode = (c: string) =>
    ['INVALID_CODE', 'CODE_EXPIRED', 'TOO_MANY_ATTEMPTS', 'TOO_MANY_CODES', 'EMAIL_UNAVAILABLE'].includes(c) ? c : 'NETWORK';

  const requestCode = trpc.auth.requestEmailCode.useMutation({
    onSuccess: (r) => {
      setError('');
      setResendLeft(r.resendInSec);
      onCodeSent?.();
    },
    onError: (e) => {
      const [c, n] = parseErr(e.message);
      if (c === 'RESEND_TOO_SOON') {
        // A code is already on its way: go to the code screen with the timer
        // The resend timer on the code screen already says when; no red error for it
        setResendLeft(n ?? RESEND_SECONDS);
        onCodeSent?.();
        return;
      }
      if (c === 'TOO_MANY_CODES') {
        setBlockedUntil(Date.now() + (n ?? 3600) * 1000);
        setNow(Date.now());
      }
      setError(codeErrorText(e.message), knownCode(c));
    },
  });

  const verifyCode = trpc.auth.verifyEmailCode.useMutation({
    onSuccess: onTokens('email'),
    onError: (e) => setError(codeErrorText(e.message), knownCode(parseErr(e.message)[0])),
  });

  const sendCode = (email: string) => {
    setError('');
    requestCode.mutate({ email: email.trim(), lang: i18n.language });
  };

  const submitCode = (email: string, value: string) => {
    if (value.length !== 6 || verifyCode.isPending) return;
    setError('');
    verifyCode.mutate({ email: email.trim(), code: value });
  };

  // ---- Password: sign-in only, for accounts created with a password (only via /login?mode=password).
  // Creating an account with a password was removed from the UI (decision 2026-11-09); the API stays.
  const loginEmailMutation = trpc.auth.loginWithEmail.useMutation({
    onSuccess: onTokens('email'),
    onError: (err) =>
      err.data?.code === 'UNAUTHORIZED'
        ? setError(t('login.pwWrong'), 'INVALID_CREDENTIALS')
        : setError(t('signin.errNetwork'), 'NETWORK'),
  });

  // ---- Telegram ----
  const telegramLoginMutation = trpc.auth.loginWithTelegram.useMutation({
    onSuccess: onTokens('telegram'),
    onError: () => setError(t('login.failedWith', { provider: 'Telegram' }), 'PROVIDER_FAILED'),
  });
  const telegramWidgetMutation = trpc.auth.loginWithTelegramWidget.useMutation({
    onSuccess: onTokens('telegram'),
    onError: () => setError(t('login.failedWith', { provider: 'Telegram' }), 'PROVIDER_FAILED'),
  });
  /**
   * On the website with the Login Widget enabled, our own Telegram button opens Telegram's login popup
   * (Telegram.Login.auth, the same server-checked data as the widget). Telegram's widget button is never
   * drawn, so the page does not swap our button for its smaller one once the methods arrive.
   */
  const widgetBotId = !inTelegram && methods?.telegramWidget ? (methods.telegramBotId ?? null) : null;
  useEffect(() => {
    if (widgetBotId) loadTelegramLogin();
  }, [widgetBotId]);

  const handleTelegram = () => {
    setError('');
    const initData = getTGInitData();
    if (initData) {
      setLoading(true);
      telegramLoginMutation.mutate({ initData }, { onSettled: () => setLoading(false) });
      return;
    }
    const login = widgetBotId ? telegramLogin() : null;
    if (login && widgetBotId) {
      login.auth({ bot_id: widgetBotId, request_access: 'write', lang: i18n.language }, (user) => {
        // false: the person closed the popup; nothing to report
        if (!user) return;
        telegramWidgetMutation.mutate(user as Parameters<typeof telegramWidgetMutation.mutate>[0]);
      });
      return;
    }
    // Website without the Telegram button: continue in the bot's mini app, keeping the invite
    window.open(telegramBotUrl(), '_blank');
    // The site tab must not look frozen: the flow shows "Continue in Telegram"
    onTelegramOpened?.();
  };

  /** The bot link, carrying the pending invite as startapp=invite_… (token validated and encoded). */
  const telegramBotUrl = () => {
    const bot = methods?.telegramBot || 'socialorganizer_bot';
    const inviteToken = pendingInviteToken
      || safeInviteToken(effectiveRedirect?.startsWith('/invite/') ? effectiveRedirect.slice('/invite/'.length).split(/[?#]/)[0] : null);
    return inviteToken ? `https://t.me/${bot}?startapp=invite_${encodeURIComponent(inviteToken)}` : `https://t.me/${bot}`;
  };

  // ---- Google ----
  const googleLoginMutation = trpc.auth.loginWithGoogle.useMutation({
    onSuccess: onTokens('google'),
    onError: (err) => {
      if (err.message === 'ACCOUNT_EXISTS_OTHER_METHOD') {
        const masked = safeMasked((err.data as { maskedEmail?: unknown } | undefined)?.maskedEmail);
        setLinking({ masked });
        return;
      }
      setError(t('login.failedWith', { provider: 'Google' }), 'PROVIDER_FAILED');
    },
  });
  /** Hidden container for the GIS fallback button (desktop, when One Tap is not shown). */
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const gisInitialized = useRef(false);

  const handleGoogleCredential = useCallback((response: GoogleCredentialResponse) => {
    setLoading(true);
    setError('');
    googleLoginMutation.mutate({ idToken: response.credential }, { onSettled: () => setLoading(false) });
  }, [googleLoginMutation]);

  const handleGoogle = useCallback(() => {
    setError('');
    if (inTelegram) {
      setError(t('auth.googleNotInTelegram'));
      return;
    }
    if (!GOOGLE_CLIENT_ID) return;
    // Native Android/iOS: Chrome Custom Tab / SFSafariViewController (WebView blocks Google sign-in)
    if (Capacitor.isNativePlatform()) {
      markLoginMethod('google');
      const params = new URLSearchParams({
        response_type: 'id_token',
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: 'https://www.orginizer.com/auth/google/callback',
        scope: 'openid email profile',
        nonce: Math.random().toString(36).slice(2),
        state: JSON.stringify({ native: '1' }),
      });
      Browser.open({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
      return;
    }
    // Mobile browsers (iOS Safari especially): the GIS popup hangs after the account is picked,
    // so use a full-page redirect; GoogleCallbackPage finishes sign-in and restores the invite
    if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
      markLoginMethod('google');
      const params = new URLSearchParams({
        response_type: 'id_token',
        client_id: GOOGLE_CLIENT_ID,
        redirect_uri: `${window.location.origin}/auth/google/callback`,
        scope: 'openid email profile',
        nonce: Math.random().toString(36).slice(2),
        prompt: 'select_account',
      });
      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
      return;
    }
    if (!window.google?.accounts?.id) {
      setError(t('signin.errFailed'));
      return;
    }
    markLoginMethod('google');
    if (!gisInitialized.current) {
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCredential, use_fedcm_for_prompt: true });
      gisInitialized.current = true;
    }
    // One Tap first; if it is not shown, render the standard button and click it
    window.google.accounts.id.prompt((notification) => {
      if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
        const container = googleBtnRef.current;
        if (container) {
          container.innerHTML = '';
          window.google!.accounts.id.renderButton(container, {
            type: 'standard', theme: 'outline', size: 'large', width: container.offsetWidth || 320, text: 'continue_with',
          });
          container.querySelector<HTMLElement>('[role="button"]')?.click();
        }
      }
    });
  }, [t, inTelegram, handleGoogleCredential]);

  // ---- Apple ----
  const handleApple = useCallback(() => {
    setError('');
    if (inTelegram) {
      setError(t('auth.googleNotInTelegram'));
      return;
    }
    if (!APPLE_SERVICE_ID) return;
    markLoginMethod('apple');
    // state.p tells the backend where to bounce the result; inv carries the invite through the round-trip
    const stateObj: Record<string, string> = { p: Capacitor.getPlatform() };
    if (pendingInviteToken) stateObj.inv = pendingInviteToken;
    const params = new URLSearchParams({
      response_type: 'code id_token',
      response_mode: 'form_post',
      client_id: APPLE_SERVICE_ID,
      redirect_uri: 'https://www.orginizer.com/api/auth/apple/callback',
      scope: 'name email',
      nonce: Math.random().toString(36).slice(2),
      state: JSON.stringify(stateObj),
    });
    const url = `https://appleid.apple.com/auth/authorize?${params.toString()}`;
    if (Capacitor.isNativePlatform()) Browser.open({ url });
    else window.location.href = url;
  }, [t, inTelegram, pendingInviteToken]);

  // ---- Which buttons, in which order ----
  const device = detectDevice();
  // Inside Telegram the Google and Apple buttons are hidden: their OAuth pages do not work in the mini app
  const available: Record<AuthProvider, boolean> = {
    google: !inTelegram && !!GOOGLE_CLIENT_ID && methods?.google !== false,
    apple: !inTelegram && !!APPLE_SERVICE_ID && methods?.apple !== false,
    telegram: true,
    email: true,
  };
  const providers = AUTH_ORDER[device].filter((p) => available[p]);
  /** E-mail codes can be switched off on the server; then the e-mail entry opens the password form. */
  const emailCodes = methods?.email !== false;

  const busy = loading || requestCode.isPending || verifyCode.isPending || googleLoginMutation.isPending
    || telegramWidgetMutation.isPending || telegramLoginMutation.isPending || loginEmailMutation.isPending;

  const start = (provider: Exclude<AuthProvider, 'email'>) => {
    if (provider === 'google') handleGoogle();
    else if (provider === 'apple') handleApple();
    else handleTelegram();
  };

  return {
    providers,
    start,
    emailCodes,
    googleBtnRef,
    busy,
    error,
    errorCode,
    setError,
    /** Google/Apple account-linking state (desktop Google sign-in); the URL carries it for redirects. */
    linking,
    clearLinking: () => setLinking(null),
    telegramBotUrl,
    // e-mail code
    sendCode,
    submitCode,
    sending: requestCode.isPending,
    verifying: verifyCode.isPending,
    resendLeft,
    /** Seconds until a new code may be requested after TOO_MANY_CODES (0 when not blocked). */
    blockedLeft,
    // password
    loginWithPassword: (email: string, password: string) => {
      setError('');
      loginEmailMutation.mutate({ email: email.trim(), password });
    },
  };
}

export type SignIn = ReturnType<typeof useSignIn>;
