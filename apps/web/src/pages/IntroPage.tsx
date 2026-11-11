import { useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui2';
import { NetFigure, type NetStep } from '../components/figures';
import { OnboardingFrame } from '../components/onboarding/OnboardingFrame';
import { useNetLabels } from '../components/onboarding/figureLabels';
import { isFirstRunPending, safePath } from '../components/onboarding/flow';
import { cn } from '../lib/utils';
import { isTelegramWebApp } from '@so/tg-adapter';
import { useConnectTelegram } from '../hooks/useConnectTelegram';

const STEPS: NetStep[] = [0, 1, 2];

/**
 * Intro (screens.md §14, onboarding.html №5–7): three frames over the same network, which stays in place
 * while only the highlight changes. No brand line; "Skip" in the corner (not on the last frame).
 * First run (?first=1 from the sign-in path; see components/onboarding/flow.ts): user.completeOnboarding, then the
 * minimum participation question, carrying ?next=. A rewatch from Help returns to /me/help.
 */
export function IntroPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const labels = useNetLabels();
  const utils = trpc.useUtils();
  const [params] = useSearchParams();
  const next = safePath(params.get('next'));
  const me = trpc.user.me.useQuery();
  const complete = trpc.user.completeOnboarding.useMutation();
  const [step, setStep] = useState<NetStep>(0);
  const touchX = useRef<number | null>(null);
  // First run comes from the sign-in path, not from user.me (new accounts are created already "onboarded").
  // user.me only covers old accounts that never finished. Decided once; until then Skip/Done wait.
  const firstRun = useRef<boolean | null>(null);
  if (firstRun.current === null) {
    if (params.get('first') === '1' || isFirstRunPending()) firstRun.current = true;
    else if (me.data) firstRun.current = !me.data.onboardingCompleted;
    else if (me.isError) firstRun.current = false;
  }
  const resolved = firstRun.current !== null;
  // A new account made with Google, Apple or e-mail: the person may already have one through Telegram.
  // Connecting it now folds this empty account into that one instead of leaving two.
  const telegram = useConnectTelegram();
  const offerTelegram =
    firstRun.current === true &&
    !isTelegramWebApp() &&
    !!me.data &&
    !me.data.platformAccounts.some((account) => account.platform === 'TELEGRAM');

  const last = step === 2;

  const finish = async () => {
    if (!resolved) return;
    if (firstRun.current) {
      try {
        await complete.mutateAsync();
      } catch {
        /* the intro must never trap anyone */
      }
      utils.user.me.setData(undefined, (old) => (old ? { ...old, onboardingCompleted: true } : old));
      navigate(next ? `/seed?first=1&next=${encodeURIComponent(next)}` : '/seed?first=1', { replace: true });
      return;
    }
    navigate('/me/help', { replace: true });
  };

  const go = (next: number) => setStep(Math.max(0, Math.min(2, next)) as NetStep);

  const onTouchStart = (event: TouchEvent) => {
    touchX.current = event.touches[0]?.clientX ?? null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = touchX.current;
    touchX.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start == null || end == null) return;
    const dx = end - start;
    if (Math.abs(dx) < 48) return;
    go(step + (dx < 0 ? 1 : -1));
  };

  const key = `s${step + 1}` as const;

  return (
    <div onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <OnboardingFrame
        corner={
          last ? null : (
            <button
              type="button"
              onClick={() => void finish()}
              disabled={complete.isPending || !resolved}
              className="so-focus grid h-10 place-items-center rounded-md px-3 text-caption font-bold text-ink-muted"
            >
              {t('intro.skip')}
            </button>
          )
        }
        foot={
          <>
            <Button className="w-full" loading={complete.isPending || (last && !resolved)} onClick={() => (last ? void finish() : go(step + 1))}>
              {last ? t('intro.done') : t('intro.next')}
            </Button>
            {/* One quiet line under the button: it must not push the button off a phone screen */}
            {offerTelegram ? (
              <button
                type="button"
                onClick={telegram.connect}
                disabled={telegram.isPending}
                className="so-focus mt-2 block min-h-11 w-full text-center text-caption font-semibold text-ink-muted"
              >
                {t('intro.haveTelegramLink')}
              </button>
            ) : null}
          </>
        }
      >
        {/* Top row is empty on the intro (no brand), the picture keeps the shared rhythm */}
        <div className="mt-3 flex h-[328px] items-center justify-center">
          <NetFigure step={step} labels={labels} className="h-full w-auto max-w-full" />
        </div>
        <div aria-live="polite">
          <h1 className="mt-6 text-h2 font-bold [text-wrap:balance]">{t(`intro.${key}.title`)}</h1>
          <p className="mt-2.5 max-w-[32ch] text-body-s text-ink-muted [&_b]:font-bold [&_b]:text-ink">
            <Trans i18nKey={`intro.${key}.text`} components={{ b: <b /> }} />
          </p>
        </div>
        <div className="mt-5 flex items-center justify-center gap-1.5" role="tablist" aria-label={t('intro.progress')}>
          {STEPS.map((i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === step}
              aria-label={t('intro.frame', { n: i + 1, total: 3 })}
              onClick={() => go(i)}
              className="so-focus grid h-6 place-items-center px-0.5"
            >
              <i
                className={cn(
                  'block h-[7px] rounded-full transition-[width] duration-base ease-so motion-reduce:transition-none',
                  i === step ? 'w-[22px] bg-ink' : 'w-[7px] bg-line-strong',
                )}
              />
            </button>
          ))}
        </div>
      </OnboardingFrame>
    </div>
  );
}
