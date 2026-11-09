/*
 * The sign-in flow shared by /login and /invite/:token: the main step (a hero from the page + buttons),
 * then e-mail → code, the password form for old accounts (only via ?mode=password), "Continue in Telegram"
 * and the account-linking screen. Every state of mockups/v2/auth.html №1–13, 16, 21 lives here.
 * The step lives in the URL (?step=email|code|telegram), so the system Back button walks back through it.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { Button, Card, Input } from '../ui2';
import { PENDING_METHOD_KEY, type LoginMethod } from '../../hooks/useAuth';
import { AuthButtons } from './AuthButtons';
import { CodeCells } from './CodeCells';
import { BackLink, BrandLine, LanguageCorner, OnboardingFrame, StepText } from './OnboardingFrame';
import { MailMark, TELEGRAM_BG, TELEGRAM_FG, TelegramMark } from './brand';
import { readPendingInvite } from './flow';
import { AlertGlyph, InfoGlyph, Note, Spinner, StateTile, TextButton, UndoGlyph } from './states';
import { useSignIn } from './useSignIn';

type Step = 'main' | 'email' | 'code' | 'password' | 'telegram';
type Provider = 'google' | 'apple' | 'telegram';

const PROVIDER_NAME: Record<Provider, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fmtTimer(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The OAuth provider the person started with (set by markLoginMethod before leaving for Google/Apple). */
function pendingProvider(): Provider | null {
  try {
    const v = localStorage.getItem(PENDING_METHOD_KEY);
    return v === 'google' || v === 'apple' || v === 'telegram' ? v : null;
  } catch {
    return null;
  }
}

export function SignInFlow({
  hero,
  top,
  centre = false,
  redirect,
  last,
}: {
  /** Main step content above the buttons (picture/avatar, title, text). */
  hero: ReactNode;
  /** Main step top row (brand line). */
  top?: ReactNode;
  centre?: boolean;
  redirect?: string | null;
  /** The method used last time: ringed on its button. */
  last?: LoginMethod | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [params, setParams] = useSearchParams();
  const passwordMode = params.get('mode') === 'password';
  const [email, setEmail] = useState('');
  const [emailBad, setEmailBad] = useState(false);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const pushed = useRef(0);

  // OAuth round-trip result (?error=cancelled|failed|account_exists&m=masked)
  const urlError = params.get('error');
  const urlMasked = params.get('m');

  const rawStep = params.get('step');
  let step: Step = passwordMode
    ? 'password'
    : rawStep === 'email' || rawStep === 'code' || rawStep === 'telegram'
      ? rawStep
      : 'main';
  // The code step needs the address typed in this session; after a reload start from the address
  if (step === 'code' && !email) step = 'email';

  const clearUrlError = (p: URLSearchParams) => {
    p.delete('error');
    p.delete('m');
  };

  const goTo = (next: Step) => {
    signIn.setError('');
    const nextParams = new URLSearchParams(params);
    clearUrlError(nextParams);
    nextParams.delete('mode');
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
    onTelegramOpened: () => goTo('telegram'),
  });

  /** Start a provider from the main step; any shown OAuth result is dropped first. */
  const start = (p: Provider) => {
    if (urlError) {
      const nextParams = new URLSearchParams(params);
      clearUrlError(nextParams);
      setParams(nextParams, { replace: true });
    }
    signIn.start(p);
  };

  const openEmail = () => {
    if (signIn.emailCodes) goTo('email');
    else {
      // E-mail codes are off on this server: fall back to the password form
      const nextParams = new URLSearchParams(params);
      clearUrlError(nextParams);
      nextParams.set('mode', 'password');
      pushed.current += 1;
      setParams(nextParams);
    }
  };

  // A rejected code is cleared so the next attempt starts from the first cell; the cells stay red until typing
  useEffect(() => {
    if (signIn.error && step === 'code') setCode('');
  }, [signIn.error, step]);

  // ---- Account linking (№13): Google/Apple brought the e-mail of an old password account ----
  if (step === 'main' && (urlError === 'account_exists' || signIn.linking)) {
    const masked = signIn.linking?.masked ?? urlMasked;
    const leave = () => {
      signIn.clearLinking();
      const nextParams = new URLSearchParams(params);
      clearUrlError(nextParams);
      setParams(nextParams, { replace: true });
    };
    return (
      <OnboardingFrame
        top={<BrandLine />}
        foot={
          <>
            <Button
              className="w-full"
              icon={<MailMark />}
              onClick={() => {
                signIn.clearLinking();
                goTo('email');
              }}
            >
              {t('login.linkByCode')}
            </Button>
            <Button variant="ghost" className="mt-2.5 w-full" onClick={leave}>
              {t('login.otherWay')}
            </Button>
          </>
        }
      >
        <StateTile tone="care" slot>
          <MailMark />
        </StateTile>
        <StepText title={t('login.linkTitle')}>
          {masked ? (
            <Trans i18nKey="login.linkText" values={{ email: masked }} components={{ b: <b /> }} />
          ) : (
            t('login.linkTextNoEmail')
          )}
        </StepText>
      </OnboardingFrame>
    );
  }

  // ---- Continue in Telegram (№16): the site opened the bot in another tab ----
  if (step === 'telegram') {
    const bot = '@socialorganizer_bot';
    return (
      <OnboardingFrame
        top={<BrandLine />}
        foot={
          <>
            <Note icon={<InfoGlyph />}>{t('login.tgTabHint')}</Note>
            <button
              type="button"
              onClick={() => window.open(signIn.telegramBotUrl(), '_blank')}
              style={{ background: TELEGRAM_BG, color: TELEGRAM_FG }}
              className="so-focus mt-3 flex h-primary w-full items-center justify-center gap-2.5 rounded-lg text-body-l font-bold tracking-tight"
            >
              <span className="inline-flex h-5 w-5">
                <TelegramMark />
              </span>
              {t('login.tgOpenAgain')}
            </button>
            <TextButton onClick={back}>{t('login.otherWayChoose')}</TextButton>
          </>
        }
      >
        <StateTile slot>
          <TelegramMark />
        </StateTile>
        <StepText title={t('login.tgTitle')}>
          <Trans
            i18nKey={readPendingInvite() ? 'login.tgTextInvite' : 'login.tgText'}
            values={{ bot }}
            components={{ b: <b /> }}
          />
        </StepText>
      </OnboardingFrame>
    );
  }

  if (step === 'email') {
    const code = signIn.errorCode;
    const blocked = signIn.blockedLeft > 0;
    const cannotSend = code === 'TOO_MANY_CODES' || code === 'EMAIL_UNAVAILABLE' || code === 'NETWORK';
    const fieldError = emailBad ? t('login.emailBad') : signIn.error || undefined;
    return (
      <OnboardingFrame top={<BackLink label={t('common.back')} onClick={back} />}>
        <h1 className="mt-2 text-h1 font-bold">{t('login.emailTitle')}</h1>
        <form
          className="mt-3.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            // Checked on the device first, in the interface language (not the browser's bubble)
            if (!EMAIL_RE.test(email.trim())) {
              setEmailBad(true);
              document.getElementById('signin-email')?.focus();
              return;
            }
            if (!blocked) signIn.sendCode(email);
          }}
        >
          <Card>
            <Input
              id="signin-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              autoFocus
              label={t('login.emailLabel')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (emailBad) setEmailBad(false);
                if (signIn.error && !blocked) signIn.setError('');
              }}
              error={fieldError}
              hint={t('login.emailHint')}
            />
            <Button
              type="submit"
              className="mt-4 w-full"
              icon={<MailMark />}
              loading={signIn.sending}
              disabled={!email.trim() || signIn.busy || blocked}
            >
              {blocked
                ? t('login.getCodeIn', { min: Math.max(1, Math.ceil(signIn.blockedLeft / 60)) })
                : t('login.getCode')}
            </Button>
          </Card>
        </form>
        {cannotSend ? (
          // No point waiting for e-mail: the other ways in, by device, right here (№4)
          <>
            <p className="mx-1 mb-2.5 mt-5 text-label font-bold text-ink-muted">{t('login.orOther')}</p>
            <AuthButtons signIn={signIn} email={false} legal={false} />
          </>
        ) : null}
      </OnboardingFrame>
    );
  }

  if (step === 'code') {
    const timer = signIn.resendLeft > 0;
    const dead = signIn.errorCode === 'TOO_MANY_ATTEMPTS' || signIn.errorCode === 'CODE_EXPIRED';
    const wait = Math.max(signIn.resendLeft, signIn.blockedLeft);
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
          off={dead}
        />
        {signIn.error ? (
          <p role="alert" className="mt-3 text-label font-semibold text-sos">
            {signIn.errorCode === 'TOO_MANY_ATTEMPTS'
              ? t('login.codeLocked')
              : signIn.errorCode === 'CODE_EXPIRED'
                ? t('login.codeExpired')
                : signIn.error}
          </p>
        ) : null}
        {dead ? (
          // The code no longer works: one main action (№8, №9)
          <Button
            className="mt-4 w-full"
            icon={<MailMark />}
            loading={signIn.sending}
            disabled={wait > 0 || signIn.busy}
            onClick={() => signIn.sendCode(email)}
          >
            {wait > 0 ? t('login.newCodeIn', { time: fmtTimer(wait) }) : t('login.newCode')}
          </Button>
        ) : (
          <>
            <p className="mt-4 text-label text-ink-muted">{t('login.codeValid')}</p>
            {/* One fixed-height line: the countdown (fixed-width m:ss, no reflow each second), "checking",
                or the resend button once the timer ends */}
            <div className="mt-0.5 flex h-6 items-center whitespace-nowrap text-label text-ink-muted">
              {signIn.verifying ? (
                <span aria-live="polite">
                  <Spinner small />
                  {t('login.checking')}
                </span>
              ) : timer ? (
                <span>
                  <Trans
                    i18nKey="login.resendIn"
                    values={{ time: fmtTimer(signIn.resendLeft) }}
                    components={{ t: <span className="inline-block min-w-[4ch] tabular-nums" /> }}
                  />
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => signIn.sendCode(email)}
                  disabled={signIn.busy}
                  // A 44 px hit area without changing the line height
                  className="so-focus relative h-6 font-bold leading-6 text-care before:absolute before:-inset-x-1 before:-inset-y-2.5"
                >
                  {t('login.resend')}
                </button>
              )}
            </div>
            {!timer && !signIn.verifying ? <p className="mt-1.5 text-label text-ink-muted">{t('login.noEmail')}</p> : null}
          </>
        )}
        <TextButton onClick={back}>{t('login.changeEmail')}</TextButton>
      </OnboardingFrame>
    );
  }

  if (step === 'password') {
    // Sign-in only, for accounts created with a password before 2026; creating one was removed (2026-11-09)
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
          <Card className="flex flex-col gap-3.5">
            <Input
              type="email"
              autoComplete="email"
              required
              label={t('login.pwEmail')}
              placeholder={t('login.emailPlaceholder')}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div>
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  label={t('auth.password')}
                  value={password}
                  className="pr-24"
                  onChange={(event) => {
                    setPassword(event.target.value);
                    if (signIn.error) signIn.setError('');
                  }}
                  error={signIn.error || undefined}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                  className="so-focus absolute right-2 top-[30px] grid h-11 place-items-center rounded-md px-2 text-caption font-bold text-care"
                >
                  {showPassword ? t('login.pwHide') : t('login.pwShow')}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" loading={signIn.busy} disabled={!email.trim() || !password}>
              {t('auth.login')}
            </Button>
          </Card>
        </form>
        <TextButton tone="care" onClick={() => goTo('email')}>
          {t('login.pwUseCode')}
        </TextButton>
        <p className="mt-1 text-center text-label text-ink-muted">{t('login.pwOnlyOld')}</p>
      </OnboardingFrame>
    );
  }

  // ---- Main step: notices for OAuth results and provider errors (№11, №12) ----
  let notice: ReactNode = null;
  if (signIn.error) {
    notice = (
      <Note tone="sos" icon={<AlertGlyph />} role="alert">
        {signIn.error}
      </Note>
    );
  } else if (urlError === 'cancelled') {
    const p = pendingProvider();
    notice = (
      <Note icon={<UndoGlyph />} role="status">
        {p ? t('login.cancelledWith', { provider: PROVIDER_NAME[p] }) : t('login.cancelled')}
      </Note>
    );
  } else if (urlError === 'failed') {
    const p = pendingProvider();
    notice = (
      <Note tone="sos" icon={<AlertGlyph />} role="alert">
        {p ? t('login.failedWith', { provider: PROVIDER_NAME[p] }) : t('login.failed')}
        {p && signIn.providers.includes(p) ? (
          <>
            {' '}
            <button type="button" onClick={() => start(p)} className="so-focus whitespace-nowrap font-bold text-care">
              {t('login.retry')}
            </button>
          </>
        ) : null}
      </Note>
    );
  }

  return (
    <OnboardingFrame
      top={top}
      corner={<LanguageCorner />}
      centre={centre}
      foot={
        <AuthButtons
          signIn={{ ...signIn, start }}
          last={last}
          notice={notice}
          onEmail={openEmail}
        />
      }
    >
      {hero}
    </OnboardingFrame>
  );
}
