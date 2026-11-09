/*
 * The sign-in flow shared by /login and /invite/:token: the main step (a hero from the page + buttons),
 * then e-mail → code, and the legacy password form (only via ?mode=password).
 * The step lives in the URL (?step=email|code), so the system Back button walks back through it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Card, Input } from '../ui2';
import { AuthButtons } from './AuthButtons';
import { CodeCells } from './CodeCells';
import { BackLink, LanguageCorner, OnboardingFrame } from './OnboardingFrame';
import { MailMark } from './brand';
import { useSignIn } from './useSignIn';

type Step = 'main' | 'email' | 'code' | 'password';

function fmtTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function SignInFlow({
  hero,
  top,
  centre = false,
  redirect,
  initialError,
}: {
  /** Main step content above the buttons (picture/avatar, title, text). */
  hero: ReactNode;
  /** Main step top row (brand line). */
  top?: ReactNode;
  centre?: boolean;
  redirect?: string | null;
  initialError?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const passwordMode = params.get('mode') === 'password';
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const pushed = useRef(0);

  const rawStep = params.get('step');
  let step: Step = passwordMode ? 'password' : rawStep === 'email' || rawStep === 'code' ? rawStep : 'main';
  // The code step needs the address typed in this session; after a reload start from the address
  if (step === 'code' && !email) step = 'email';

  const goTo = (next: Step) => {
    signIn.setError('');
    const nextParams = new URLSearchParams(params);
    if (next === 'main') nextParams.delete('step');
    else nextParams.set('step', next);
    pushed.current += 1;
    setParams(nextParams);
  };

  const back = () => {
    signIn.setError('');
    if (pushed.current > 0 && location.key !== 'default') {
      pushed.current -= 1;
      navigate(-1);
      return;
    }
    const nextParams = new URLSearchParams(params);
    nextParams.delete('step');
    nextParams.delete('mode');
    setParams(nextParams, { replace: true });
  };

  const signIn = useSignIn({
    redirect,
    onCodeSent: () => {
      setCode('');
      if (step !== 'code') goTo('code');
    },
  });

  // A rejected code is cleared so the next attempt starts from the first cell; the cells stay red until typing
  useEffect(() => {
    if (signIn.error && step === 'code') setCode('');
  }, [signIn.error, step]);

  // Error carried in from an OAuth round-trip (?error=…), shown once on the main step
  const [carried, setCarried] = useState(initialError ?? '');
  const mainError = signIn.error || carried;

  if (step === 'email') {
    return (
      <OnboardingFrame top={<BackLink label={t('common.back')} onClick={back} />}>
        <h1 className="mt-2 text-h1 font-bold">{t('login.emailTitle')}</h1>
        <form
          className="mt-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            if (email.trim()) signIn.sendCode(email);
          }}
        >
          <Card>
            <Input
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              required
              label={t('login.emailLabel')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              error={signIn.error || undefined}
              hint={t('login.emailHint')}
            />
            <Button
              type="submit"
              className="mt-4 w-full"
              icon={<MailMark />}
              loading={signIn.sending}
              disabled={!email.trim() || signIn.busy}
            >
              {t('login.getCode')}
            </Button>
          </Card>
        </form>
      </OnboardingFrame>
    );
  }

  if (step === 'code') {
    const timer = signIn.resendLeft > 0;
    return (
      <OnboardingFrame top={<BackLink label={t('common.back')} onClick={back} />}>
        <h1 className="mt-2 text-h1 font-bold">{t('login.codeTitle')}</h1>
        <p className="mt-1 break-words text-caption text-ink-muted [&_b]:font-bold [&_b]:text-ink">
          <Trans i18nKey="login.codeSent" values={{ email: email.trim() }} components={{ b: <b /> }} />
        </p>
        <CodeCells
          value={code}
          onChange={(v) => {
            setCode(v);
            if (signIn.error) signIn.setError('');
          }}
          onComplete={(v) => signIn.submitCode(email, v)}
          label={t('login.codeLabel')}
          invalid={!!signIn.error}
          busy={signIn.verifying}
        />
        {signIn.error ? (
          <p role="alert" className="mt-3 text-label font-semibold text-sos">
            {signIn.error}
          </p>
        ) : null}
        <p className="mt-4 text-label text-ink-muted" aria-live="polite">
          {signIn.verifying ? (
            t('login.checking')
          ) : (
            <>
              {t('login.codeValid')}{' '}
              {timer ? (
                t('login.resendIn', { time: fmtTimer(signIn.resendLeft) })
              ) : (
                <button
                  type="button"
                  onClick={() => signIn.sendCode(email)}
                  disabled={signIn.busy}
                  className="so-focus font-bold text-care"
                >
                  {t('login.resend')}
                </button>
              )}
            </>
          )}
        </p>
        <button
          type="button"
          onClick={back}
          className="so-focus mt-3.5 block min-h-10 w-full text-center text-body-s font-bold text-ink-muted"
        >
          {t('login.changeEmail')}
        </button>
      </OnboardingFrame>
    );
  }

  if (step === 'password') {
    return (
      <OnboardingFrame top={<BackLink label={t('common.back')} onClick={back} />}>
        <h1 className="mt-2 text-h1 font-bold">{t('login.passwordTitle')}</h1>
        <form
          className="mt-3.5"
          onSubmit={(event) => {
            event.preventDefault();
            signIn.loginWithPassword(email, password);
          }}
        >
          <Card className="flex flex-col gap-4">
            <Input
              type="email"
              autoComplete="email"
              required
              label={t('login.emailLabel')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Input
              type="password"
              autoComplete="current-password"
              required
              label={t('auth.password')}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
            <Input
              type="text"
              autoComplete="name"
              label={t('signin.nameForNew')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            {signIn.error ? (
              <p role="alert" className="text-label font-semibold text-sos">
                {signIn.error}
              </p>
            ) : null}
            <div>
              <Button type="submit" className="w-full" disabled={signIn.busy || !email.trim() || !password}>
                {t('auth.login')}
              </Button>
              <Button
                variant="secondary"
                className="mt-2.5 w-full"
                disabled={signIn.busy || !email.trim() || password.length < 6}
                onClick={() => signIn.registerWithPassword(email, password, name)}
              >
                {t('signin.createAccount')}
              </Button>
            </div>
          </Card>
        </form>
      </OnboardingFrame>
    );
  }

  return (
    <OnboardingFrame
      top={top}
      corner={<LanguageCorner />}
      centre={centre}
      foot={
        <AuthButtons
          signIn={{ ...signIn, error: mainError }}
          onEmail={() => {
            setCarried('');
            if (signIn.emailCodes) goTo('email');
            else {
              // E-mail codes are off on this server: fall back to the password form
              const nextParams = new URLSearchParams(params);
              nextParams.set('mode', 'password');
              pushed.current += 1;
              setParams(nextParams);
            }
          }}
        />
      }
    >
      {hero}
    </OnboardingFrame>
  );
}
