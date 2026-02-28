import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui/button';
import { Logo } from '../components/Logo';
import { Mail, Eye, EyeOff, Send, KeyRound } from 'lucide-react';
import { isTelegramWebApp, getTGInitData } from '@so/tg-adapter';

export function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const redirect = searchParams.get('redirect');
  const login = useAuth((s) => s.login);

  // If user was in demo mode, clear tokens and reload so tRPC client uses real HTTP link
  useEffect(() => {
    if (localStorage.getItem('accessToken') === 'demo-token') {
      localStorage.removeItem('accessToken');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('userId');
      window.location.reload();
    }
  }, []);

  // Use pendingInviteToken from localStorage as fallback redirect
  const pendingInviteToken = localStorage.getItem('pendingInviteToken');
  const effectiveRedirect = redirect || (pendingInviteToken ? `/invite/${pendingInviteToken}` : null);

  const afterLogin = (defaultPath: string) => {
    localStorage.removeItem('pendingInviteToken');
    if (effectiveRedirect) {
      // Full page reload to reinitialize trpcClient (important after demo mode)
      window.location.href = effectiveRedirect;
    } else {
      navigate(defaultPath);
    }
  };

  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'choice' | 'register' | 'linkCode' | 'login'>('choice');
  const [linkCode, setLinkCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');

  const loginMutation = trpc.auth.loginWithPlatform.useMutation({
    onSuccess: (data) => {
      if (!data?.accessToken) {
        setError('Login failed. Please try again.');
        return;
      }
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/onboarding');
    },
  });

  const registerMutation = trpc.auth.registerWithEmail.useMutation({
    onSuccess: (data) => {
      if (!data?.accessToken) {
        setError('Registration failed. Please try again.');
        return;
      }
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/onboarding');
    },
    onError: (err) => {
      setError(err.message === 'Email already registered' ? t('auth.emailExists') : err.message);
    },
  });

  const loginEmailMutation = trpc.auth.loginWithEmail.useMutation({
    onSuccess: (data) => {
      if (!data?.accessToken) {
        setError(t('auth.invalidCredentials'));
        return;
      }
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/dashboard');
    },
    onError: () => {
      setError(t('auth.invalidCredentials'));
    },
  });

  const linkCodeMutation = trpc.auth.loginWithLinkCode.useMutation({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/dashboard');
    },
    onError: () => {
      setError(t('auth.invalidLinkCode'));
    },
  });

  const claimMutation = trpc.auth.claimWithLinkCode.useMutation({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/dashboard');
    },
    onError: (err) => {
      setError(err.message === 'Email already registered' ? t('auth.emailExists') : t('auth.invalidLinkCode'));
    },
  });

  const telegramLoginMutation = trpc.auth.loginWithTelegram.useMutation({
    onSuccess: (data) => {
      login(data.accessToken, data.refreshToken, data.userId);
      afterLogin('/dashboard');
    },
    onError: () => {
      setError(t('auth.telegramError'));
    },
  });

  const handleTelegramLogin = () => {
    const initData = getTGInitData();
    if (initData) {
      setLoading(true);
      telegramLoginMutation.mutate(
        { initData },
        { onSettled: () => setLoading(false) },
      );
    } else {
      // Not inside Telegram — open the bot so user can launch the WebApp
      // Include invite token as startParam so it's not lost
      const inviteToken = pendingInviteToken || (effectiveRedirect?.startsWith('/invite/') ? effectiveRedirect.slice('/invite/'.length) : null);
      const botUrl = inviteToken
        ? `https://t.me/socialorganizer_bot?startapp=invite_${inviteToken}`
        : 'https://t.me/socialorganizer_bot';
      window.open(botUrl, '_blank');
    }
  };

  const goBack = () => {
    setStep('choice');
    setError('');
    setLinkCode('');
  };

  const handleEmailSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (linkCode.length === 6) {
      claimMutation.mutate(
        { code: linkCode, email, password },
        { onSettled: () => setLoading(false) },
      );
    } else if (step === 'register') {
      registerMutation.mutate(
        { email, password, name: name || undefined },
        { onSettled: () => setLoading(false) },
      );
    } else {
      loginEmailMutation.mutate(
        { email, password },
        { onSettled: () => setLoading(false) },
      );
    }
  };

  const googleButton = (
    <Button
      className="w-full bg-white hover:bg-gray-100 text-gray-900 border border-gray-300"
      size="lg"
      onClick={() => {
        if (isTelegramWebApp()) {
          setError(t('auth.googleNotInTelegram'));
          return;
        }
        setLoading(true);
        const stubToken = `stub-GOOGLE-${Date.now()}`;
        loginMutation.mutate(
          { platform: 'GOOGLE', platformToken: stubToken },
          { onSettled: () => setLoading(false) },
        );
      }}
      disabled={loading}
    >
      <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Google
    </Button>
  );

  const divider = (
    <div className="relative w-full my-4">
      <div className="absolute inset-0 flex items-center">
        <div className="w-full border-t border-white/10" />
      </div>
      <div className="relative flex justify-center">
        <span className="bg-gray-950 px-3 text-gray-500 dark:text-gray-300 text-xs">{t('login.or')}</span>
      </div>
    </div>
  );

  const backButton = (
    <button
      type="button"
      onClick={goBack}
      className="text-gray-400 hover:text-white text-sm transition-colors"
    >
      {'\u2190'} {t('common.back')}
    </button>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-950 to-gray-950 flex flex-col items-center justify-center px-6">
      <div className="flex flex-col items-center w-full max-w-sm">
        <Logo size={100} className="text-teal-400 mb-4" />
        <h1 className="text-3xl font-bold text-white mb-2">Social Organizer</h1>
        <p className="text-gray-400 text-sm mb-8 text-center max-w-xs">
          {t('login.subtitle')}
        </p>

        {step === 'choice' && (
          <div className="w-full space-y-4">
            <Button
              className="w-full bg-teal-600 hover:bg-teal-500 text-white"
              size="lg"
              onClick={() => setStep('register')}
            >
              {t('auth.newUser')}
            </Button>
            <Button
              className="w-full bg-white/10 hover:bg-white/15 text-white border border-white/10"
              size="lg"
              onClick={() => setStep('linkCode')}
            >
              {t('auth.haveAccount')}
            </Button>
          </div>
        )}

        {step === 'register' && (
          <>
            <form onSubmit={handleEmailSubmit} className="w-full space-y-3 mb-6">
              <input
                type="text"
                placeholder={t('auth.name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              <input
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
                size="lg"
                disabled={loading}
              >
                <Mail size={18} className="mr-2" />
                {t('auth.register')}
              </Button>
            </form>

            {divider}

            <div className="w-full space-y-3">
              {googleButton}
            </div>

            <div className="mt-6">
              {backButton}
            </div>
          </>
        )}

        {step === 'linkCode' && (
          <div className="w-full space-y-4">
            <p className="text-gray-400 text-xs text-center">{t('auth.linkCodeHint')}</p>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="000000"
              value={linkCode}
              onChange={(e) => setLinkCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white text-center text-2xl tracking-[0.5em] font-mono placeholder-gray-600 focus:outline-none focus:border-teal-500 transition-colors"
            />
            {linkCode.length === 6 && (
              <p className="text-teal-400 text-xs text-center">{t('auth.setEmailHint')}</p>
            )}

            <Button
              className="w-full bg-teal-600 hover:bg-teal-500 text-white"
              size="lg"
              disabled={linkCode.length !== 6}
              onClick={() => setStep('login')}
            >
              <KeyRound size={18} className="mr-2" />
              {t('common.next')}
            </Button>

            <button
              type="button"
              onClick={() => { setLinkCode(''); setStep('login'); }}
              className="w-full text-center text-gray-400 hover:text-white text-sm transition-colors"
            >
              {t('auth.noLinkCode')}
            </button>

            <div className="flex justify-center mt-2">
              {backButton}
            </div>
          </div>
        )}

        {step === 'login' && (
          <>
            <form onSubmit={handleEmailSubmit} className="w-full space-y-3 mb-6">
              <input
                type="email"
                placeholder={t('auth.email')}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
              />
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.password')}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={linkCode.length === 6 ? 6 : 1}
                  className="w-full px-4 py-3 pr-12 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-teal-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-300 hover:text-gray-300 transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>

              {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full bg-teal-600 hover:bg-teal-500 text-white"
                size="lg"
                disabled={loading}
              >
                {linkCode.length === 6 ? (
                  <><KeyRound size={18} className="mr-2" />{t('auth.linkAndLogin')}</>
                ) : (
                  <><Mail size={18} className="mr-2" />{t('auth.login')}</>
                )}
              </Button>
            </form>

            {divider}

            <div className="w-full space-y-3">
              {isTelegramWebApp() && (
                <Button
                  className="w-full bg-[#2AABEE] hover:bg-[#229ED9] text-white"
                  size="lg"
                  onClick={handleTelegramLogin}
                  disabled={loading}
                >
                  <Send size={18} className="mr-2" />
                  Telegram
                </Button>
              )}
              {googleButton}
            </div>

            <div className="mt-6">
              {backButton}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
