/*
 * "Signing in with Google / Apple / Telegram…" in the shared frame (auth.html №10, №14): brand, the provider
 * mark in a tile, one sentence and the care spinner. After 10 s a way back to the sign-in screen appears,
 * in case the tab hangs. `bare` drops the brand and the way back (Telegram Mini App: Telegram draws the header).
 * `appLink`: the sign-in finished in the system browser and the app did not open by itself; a tap opens it.
 */
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BrandLine, OnboardingFrame } from './OnboardingFrame';
import { AppleMark, GoogleMark, TelegramMark } from './brand';
import { Spinner, StateTile, TextButton } from './states';
import { Button } from '../ui2';
import { BrandMark } from '../ui2/BrandMark';

export type WaitProvider = 'google' | 'apple' | 'telegram';
const NAME: Record<WaitProvider, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram' };

export function ProviderWait({
  provider,
  bare = false,
  appLink = null,
}: {
  provider: WaitProvider;
  bare?: boolean;
  appLink?: string | null;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (bare) return;
    const id = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(id);
  }, [bare]);

  if (bare) {
    // Mini App: only the mark, the spinner and one line; usually less than a second
    return (
      <main className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-canvas text-ink" aria-busy>
        <BrandMark size={72} />
        <Spinner label={t('login.waitTitle', { provider: NAME[provider] })} />
        <p className="text-body-s font-semibold text-ink-muted">{t('login.waitTitle', { provider: NAME[provider] })}</p>
      </main>
    );
  }

  const mark = provider === 'google' ? <GoogleMark /> : provider === 'apple' ? <AppleMark /> : <TelegramMark />;
  return (
    <OnboardingFrame
      top={<BrandLine />}
      centre
      foot={
        appLink ? (
          // Inside the system browser "back to sign-in" would open the site there, not the app
          <Button className="w-full" onClick={() => { window.location.href = appLink; }}>
            {t('login.waitOpenApp')}
          </Button>
        ) : slow ? (
          <TextButton onClick={() => navigate('/login', { replace: true })}>{t('login.waitBack')}</TextButton>
        ) : null
      }
    >
      <div className="mt-[72px]">
        <StateTile>{mark}</StateTile>
      </div>
      <h1 className="mt-4 text-h2 font-bold [text-wrap:balance]">{t('login.waitTitle', { provider: NAME[provider] })}</h1>
      <p className="mt-2.5 max-w-[30ch] text-body-s text-ink-muted">{t('login.waitText', { provider: NAME[provider] })}</p>
      <div className="mt-7" aria-live="polite">
        <Spinner />
      </div>
    </OnboardingFrame>
  );
}
