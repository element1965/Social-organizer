import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth, markLoginMethod, getLastLoginMethod, type LoginMethod } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';
import { takePendingSosPath } from '../lib/inviteUrl';
import { Mail, Eye, EyeOff, Send, KeyRound } from 'lucide-react';
import { isTelegramWebApp, getTGInitData } from '@so/tg-adapter';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const APPLE_SERVICE_ID = import.meta.env.VITE_APPLE_SERVICE_ID as string | undefined;
const RESEND_SECONDS = 60;

type Step = 'main' | 'email' | 'code' | 'password' | 'telegramCode';

declare global {
  interface Window {
    onTelegramAuth?: (user: Record<string, unknown>) => void;
  }
}

/** "CODE:number" from the server → [code, number] */
function parseErr(message: string): [string, number | null] {
  const [code, n] = message.split(':');
  return [code ?? '', n != null && n !== '' ? Number(n) : null];
}

/**
 * One sign-in screen for new and existing people (SO-21): Google, Apple, Telegram and an e-mail code.
 * The server decides whether the account is new; no password is needed.
 */
export function LoginPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const returnedError = searchParams.get('error');
  const login = useAuth((s) => s.login);
  const inTelegram = isTelegramWebApp();
  const { data: methods } = trpc.auth.methods.useQuery(undefined, { staleTime: 5 * 60 * 1000 });

  // If user was in demo mode, clear tokens and reload so tRPC client uses real HTTP link
  useEffect(() => {
    if (localStorage.getItem('accessToken') === 'demo-token') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      window.location.reload();
    }
  }, []);

  // The invite survives every method: it stays in localStorage until InvitePage accepts it
  const pendingInviteToken = localStorage.getItem('pendingInviteToken');
  const effectiveRedirect = redirect || (pendingInviteToken ? `/invite/${pendingInviteToken}` : null);

  const afterLogin = (isNew: boolean) => {
    const pendingSos = takePendingSosPath();
    const target = effectiveRedirect || pendingSos;
    if (target) {
      // Full page reload to reinitialize trpcClient (important after demo mode)
      window.location.href = target;
    } else {
      navigate(isNew ? '/onboarding' : '/dashboard');
    }
  };

  const [step, setStep] = useState<Step>('main');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(() =>
    returnedError === 'account_exists' ? t('signin.errAccountExists') : returnedError ? t('signin.errFailed') : '',
  );
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resendLeft, setResendLeft] = useState(0);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [linkCode, setLinkCode] = useState('');
  const lastMethod = getLastLoginMethod();

  // Resend countdown
  useEffect(() => {
    if (resendLeft <= 0) return;
    const id = setTimeout(() => setResendLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendLeft]);

  const go = (next: Step) => {
    setError('');
    setStep(next);
  };

  const onTokens = (method: LoginMethod | null) => (data: { accessToken: string; refreshToken: string; userId: string; isNew?: boolean }) => {
    if (method) markLoginMethod(method);
    login(data.accessToken, data.refreshToken, data.userId);
    afterLogin(!!data.isNew);
  };

  // ---- E-mail code ----
  const codeErrorText = (message: string): string => {
    const [c, n] = parseErr(message);
    switch (c) {
      case 'INVALID_CODE': return n != null ? t('signin.errInvalid', { count: n }) : t('signin.errInvalidNoCount');
      case 'CODE_EXPIRED': return t('signin.errExpired');
      case 'TOO_MANY_ATTEMPTS': return t('signin.errAttempts');
      case 'RESEND_TOO_SOON': return t('signin.errTooSoon', { sec: n ?? RESEND_SECONDS });
      case 'TOO_MANY_CODES': return t('signin.errTooMany', { min: Math.max(1, Math.ceil((n ?? 3600) / 60)) });
      case 'EMAIL_UNAVAILABLE': return t('signin.errUnavailable');
      default: return t('signin.errNetwork');
    }
  };

  const requestCode = trpc.auth.requestEmailCode.useMutation({
    onSuccess: (r) => {
      setCode('');
      setResendLeft(r.resendInSec);
      go('code');
    },
    onError: (e) => {
      const [c, n] = parseErr(e.message);
      if (c === 'RESEND_TOO_SOON') {
        // A code is already on its way: go to the code screen with the timer
        setResendLeft(n ?? RESEND_SECONDS);
        setStep('code');
      }
      setError(codeErrorText(e.message));
    },
  });

  const verifyCode = trpc.auth.verifyEmailCode.useMutation({
    onSuccess: onTokens('email'),
    onError: (e) => {
      setCode('');
      setError(codeErrorText(e.message));
    },
  });

  const sendCode = () => {
    setError('');
    requestCode.mutate({ email: email.trim(), lang: i18n.language });
  };

  const submitCode = (value: string) => {
    if (value.length !== 6 || verifyCode.isPending) return;
    setError('');
    verifyCode.mutate({ email: email.trim(), code: value });
  };

  // ---- Fallbacks while e-mail codes or the Telegram web button are unavailable ----
  const loginEmailMutation = trpc.auth.loginWithEmail.useMutation({
    onSuccess: onTokens('email'),
    onError: () => setError(t('auth.invalidCredentials')),
  });
  const registerMutation = trpc.auth.registerWithEmail.useMutation({
    onSuccess: (data) => onTokens('email')({ ...data, isNew: true }),
    onError: (err) => setError(err.message === 'Email already registered' ? t('auth.emailExists') : t('signin.errFailed')),
  });
  const linkCodeMutation = trpc.auth.loginWithLinkCode.useMutation({
    onSuccess: onTokens('telegram'),
    onError: () => setError(t('auth.invalidLinkCode')),
  });

  // ---- Telegram ----
  const telegramLoginMutation = trpc.auth.loginWithTelegram.useMutation({
    onSuccess: onTokens('telegram'),
    onError: () => setError(t('auth.telegramError')),
  });
  const telegramWidgetMutation = trpc.auth.loginWithTelegramWidget.useMutation({
    onSuccess: onTokens('telegram'),
    onError: () => setError(t('auth.telegramError')),
  });
  const widgetRef = useRef<HTMLDivElement>(null);
  const useWidget = !inTelegram && !!methods?.telegramWidget;

  // Server-checked Telegram Login Widget on the website
  useEffect(() => {
    if (step !== 'main' || !useWidget || !widgetRef.current || !methods?.telegramBot) return;
    window.onTelegramAuth = (user) => {
      setError('');
      telegramWidgetMutation.mutate(user as Parameters<typeof telegramWidgetMutation.mutate>[0]);
    };
    const s = document.createElement('script');
    s.src = 'https://telegram.org/js/telegram-widget.js?22';
    s.async = true;
    s.setAttribute('data-telegram-login', methods.telegramBot);
    s.setAttribute('data-size', 'large');
    s.setAttribute('data-radius', '12');
    s.setAttribute('data-request-access', 'write');
    s.setAttribute('data-onauth', 'onTelegramAuth(user)');
    widgetRef.current.innerHTML = '';
    widgetRef.current.appendChild(s);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, useWidget, methods?.telegramBot]);

  const handleTelegram = () => {
    setError('');
    const initData = getTGInitData();
    if (initData) {
      setLoading(true);
      telegramLoginMutation.mutate({ initData }, { onSettled: () => setLoading(false) });
      return;
    }
    // Website without the Telegram button: continue in the bot's mini app, keeping the invite
    const bot = methods?.telegramBot || 'socialorganizer_bot';
    const inviteToken = pendingInviteToken || (effectiveRedirect?.startsWith('/invite/') ? effectiveRedirect.slice('/invite/'.length) : null);
    window.open(inviteToken ? `https://t.me/${bot}?startapp=invite_${inviteToken}` : `https://t.me/${bot}`, '_blank');
  };

  // ---- Google ----
  const googleLoginMutation = trpc.auth.loginWithGoogle.useMutation({
    onSuccess: onTokens('google'),
    onError: (err) => setError(err.message === 'ACCOUNT_EXISTS_OTHER_METHOD' ? t('signin.errAccountExists') : t('signin.errFailed')),
  });
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const gisInitialized = useRef(false);

  const handleGoogleCredential = useCallback((response: GoogleCredentialResponse) => {
    setLoading(true);
    setError('');
    googleLoginMutation.mutate({ idToken: response.credential }, { onSettled: () => setLoading(false) });
  }, [googleLoginMutation]);

  const handleGoogleClick = useCallback(() => {
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
            type: 'standard', theme: 'outline', size: 'large', width: container.offsetWidth, text: 'continue_with',
          });
          container.querySelector<HTMLElement>('[role="button"]')?.click();
        }
      }
    });
  }, [t, inTelegram, handleGoogleCredential]);

  // ---- Apple ----
  const handleAppleClick = useCallback(() => {
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

  // ---- UI ----
  const showGoogle = !!GOOGLE_CLIENT_ID && methods?.google !== false;
  const showApple = !!APPLE_SERVICE_ID && methods?.apple !== false;
  const emailCodes = methods?.email !== false;
  const busy = loading || requestCode.isPending || verifyCode.isPending || googleLoginMutation.isPending
    || telegramWidgetMutation.isPending || loginEmailMutation.isPending || registerMutation.isPending || linkCodeMutation.isPending;
  const methodName: Record<LoginMethod, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram', email: 'e-mail' };

  const inputCls = 'w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors';
  const errorLine = error ? <p role="alert" className="text-red-400 text-sm text-center">{error}</p> : null;
  const backButton = (
    <button type="button" onClick={() => go('main')} className="text-gray-400 hover:text-white text-sm transition-colors">
      {'←'} {t('common.back')}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6 py-8">
      <div className="flex flex-col items-center w-full max-w-sm">
        <Logo size={64} className="text-teal-400 mb-3" />

        {step === 'main' && (
          <div className="w-full flex flex-col items-center">
            <h1 className="text-2xl font-bold text-white text-center mb-2">{t('signin.title')}</h1>
            <p className="text-gray-400 text-sm text-center mb-5">{t('signin.subtitle')}</p>

            {lastMethod && (
              <p className="w-full mb-3 px-4 py-2 rounded-xl border border-white/10 bg-white/5 text-gray-300 text-xs text-center">
                {t('signin.lastMethod', { method: methodName[lastMethod] })}
              </p>
            )}

            <div className="w-full space-y-3">
              {showGoogle && (
                <div className="w-full">
                  <Button className="w-full bg-white hover:bg-gray-100 text-gray-900 border border-gray-300" size="lg" onClick={handleGoogleClick} disabled={busy}>
                    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" aria-hidden="true">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    {t('signin.continueGoogle')}
                  </Button>
                  <div ref={googleBtnRef} className="hidden" />
                </div>
              )}

              {showApple && (
                <Button className="w-full bg-white hover:bg-gray-100 text-gray-900 border border-gray-300" size="lg" onClick={handleAppleClick} disabled={busy}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3.02-.84.99-2.2 1.75-3.32 1.66-.14-1.12.42-2.3 1.1-3.04.78-.86 2.16-1.5 3.34-1.64zM20.5 17.04c-.6 1.38-.88 1.99-1.65 3.21-1.08 1.7-2.6 3.82-4.49 3.84-1.68.02-2.11-1.1-4.39-1.08-2.28.01-2.75 1.1-4.43 1.08-1.89-.02-3.33-1.93-4.41-3.63C-1.1 16.5-1.42 10.9 1.45 8.05c.97-.99 2.36-1.62 3.7-1.62 1.7 0 2.77 1.1 4.18 1.1 1.36 0 2.19-1.1 4.16-1.1 1.2 0 2.47.65 3.38 1.78-2.97 1.63-2.49 5.87.63 7.05z"/>
                  </svg>
                  {t('signin.continueApple')}
                </Button>
              )}

              {useWidget ? (
                <div ref={widgetRef} className="w-full flex justify-center min-h-[44px]" />
              ) : (
                <Button className="w-full bg-[#2AABEE]/15 hover:bg-[#2AABEE]/25 text-[#8fd3f7] border border-[#2AABEE]/40" size="lg" onClick={handleTelegram} disabled={busy}>
                  <Send size={18} className="mr-2" />
                  {t('signin.continueTelegram')}
                </Button>
              )}

              <Button
                className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
                size="lg"
                onClick={() => go(emailCodes ? 'email' : 'password')}
                disabled={busy}
              >
                <Mail size={18} className="mr-2" />
                {emailCodes ? t('signin.emailCode') : t('signin.emailPassword')}
              </Button>
            </div>

            {error && <div className="mt-3">{errorLine}</div>}

            <p className="text-gray-500 text-xs text-center mt-5">{emailCodes ? t('signin.footer') : t('signin.footerShort')}</p>

            {!useWidget && !inTelegram && (
              <button type="button" onClick={() => go('telegramCode')} className="mt-4 text-teal-400 hover:text-teal-300 text-xs">
                {t('signin.telegramCodeLink')}
              </button>
            )}
          </div>
        )}

        {step === 'email' && (
          <form className="w-full space-y-3" onSubmit={(e) => { e.preventDefault(); sendCode(); }}>
            <h1 className="text-xl font-bold text-white text-center">{t('signin.emailTitle')}</h1>
            <p className="text-gray-400 text-sm text-center">{t('signin.emailHint')}</p>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder={t('auth.email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className={inputCls}
            />
            {errorLine}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-white" size="lg" disabled={busy || !email.trim()}>
              {t('signin.sendCode')}
            </Button>
            <div className="flex justify-center pt-2">{backButton}</div>
          </form>
        )}

        {step === 'code' && (
          <div className="w-full space-y-3">
            <h1 className="text-xl font-bold text-white text-center">{t('signin.codeTitle')}</h1>
            <p className="text-gray-400 text-sm text-center break-words">{t('signin.codeSent', { email: email.trim() })}</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t('signin.codeTitle')}
              maxLength={6}
              placeholder="000000"
              value={code}
              autoFocus
              onChange={(e) => {
                const v = e.target.value.replace(/\D/g, '').slice(0, 6);
                setCode(v);
                if (v.length === 6) submitCode(v);
              }}
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-600`}
            />
            {errorLine}
            <Button className="w-full bg-teal-600 hover:bg-teal-500 text-white" size="lg" disabled={busy || code.length !== 6} onClick={() => submitCode(code)}>
              {t('auth.login')}
            </Button>
            <div className="flex flex-col items-center gap-2 pt-1 text-sm">
              {resendLeft > 0 ? (
                <span className="text-gray-500">{t('signin.resendIn', { sec: resendLeft })}</span>
              ) : (
                <button type="button" onClick={sendCode} disabled={busy} className="text-teal-400 hover:text-teal-300">
                  {t('signin.resend')}
                </button>
              )}
              <button type="button" onClick={() => { setCode(''); go('email'); }} className="text-gray-400 hover:text-white">
                {t('signin.changeEmail')}
              </button>
              <p className="text-gray-500 text-xs text-center">{t('signin.noEmailHint')}</p>
            </div>
            <div className="flex justify-center pt-1">{backButton}</div>
          </div>
        )}

        {step === 'password' && (
          <form
            className="w-full space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              setError('');
              loginEmailMutation.mutate({ email: email.trim(), password });
            }}
          >
            <h1 className="text-xl font-bold text-white text-center">{t('signin.passwordTitle')}</h1>
            <input type="email" autoComplete="email" placeholder={t('auth.email')} value={email} onChange={(e) => setEmail(e.target.value)} required className={inputCls} />
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder={t('auth.password')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={1}
                className={`${inputCls} pr-12`}
              />
              <button type="button" aria-label={t('auth.password')} onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-200">
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            <input type="text" autoComplete="name" placeholder={t('signin.nameForNew')} value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
            {errorLine}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-white" size="lg" disabled={busy}>
              {t('auth.login')}
            </Button>
            <Button
              type="button"
              className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10"
              size="lg"
              disabled={busy || password.length < 6}
              onClick={() => { setError(''); registerMutation.mutate({ email: email.trim(), password, name: name || undefined }); }}
            >
              {t('signin.createAccount')}
            </Button>
            <div className="flex justify-center pt-2">{backButton}</div>
          </form>
        )}

        {step === 'telegramCode' && (
          <form className="w-full space-y-3" onSubmit={(e) => { e.preventDefault(); setError(''); linkCodeMutation.mutate({ code: linkCode }); }}>
            <h1 className="text-xl font-bold text-white text-center">{t('signin.telegramCodeLink')}</h1>
            <p className="text-gray-400 text-xs text-center">{t('auth.linkCodeHint')}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className={`${inputCls} text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-600`}
            />
            {errorLine}
            <Button type="submit" className="w-full bg-teal-600 hover:bg-teal-500 text-white" size="lg" disabled={busy || linkCode.length !== 6}>
              <KeyRound size={18} className="mr-2" />
              {t('auth.login')}
            </Button>
            <div className="flex justify-center pt-2">{backButton}</div>
          </form>
        )}
      </div>
    </div>
  );
}
