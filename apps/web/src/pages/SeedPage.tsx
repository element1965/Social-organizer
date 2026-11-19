import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth';
import { trpc } from '../lib/trpc';
import { Button, Card } from '../components/ui2';
import { AppLoader } from '../components/ui2/AppLoader';
import { BackLink, BrandLine, OnboardingFrame, StepText } from '../components/onboarding/OnboardingFrame';
import { CheckMark } from '../components/onboarding/brand';
import { clearFirstRun, introPath, safePath } from '../components/onboarding/flow';

/**
 * A name made up by the sign-in, not chosen by the person: the part of an e-mail address before "@" ("anna.k"),
 * or the stand-in for a Telegram account without a first name. Nobody would recognise it in their circle.
 */
function madeUpName(name: string, email: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return true;
  if (/^User_\d+$/.test(trimmed)) return true;
  return !!email && trimmed === (email.split('@')[0] ?? '');
}

/**
 * The name step of a first run (screens.md §15). Asked only when the account has no real name yet (an e-mail
 * sign-up); Google, Apple and Telegram bring one, and then this step passes straight on. The intention is not asked
 * here any more: new accounts start at 1 $ and the person meets the question where it means something (the first
 * step on the empty Circle, and after a first Participation). `?end=1` (after the intro) closes the first run;
 * without it (a newcomer on the way to a Need) the first run stays pending, so the intro is offered after taking part.
 */
export function SeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where a newcomer was headed (a Need, say); only same-origin paths
  const next = safePath(params.get('next'));
  const end = params.get('end') === '1';
  const userId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  const { data: intro } = trpc.pending.introStatus.useQuery(undefined, { staleTime: 30_000 });
  const updateUser = trpc.user.update.useMutation({ meta: { notifyOnError: false } });
  const [name, setName] = useState('');
  // Show the error only after a submit attempt.
  const [submitted, setSubmitted] = useState(false);
  const [needed, setNeeded] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const leave = () => {
    if (end) clearFirstRun(userId);
    navigate(next ?? '/', { replace: true });
  };
  const leaveRef = useRef(leave);
  leaveRef.current = leave;

  // Decided once from the account: a real name passes on at once, a made-up one is asked
  useEffect(() => {
    if (needed !== null) return;
    if (me.isError) {
      // Nothing to decide from: the first run must never trap anyone
      setNeeded(false);
      leaveRef.current();
      return;
    }
    if (!me.data) return;
    const currentName = String(me.data.name ?? '');
    const email = String((me.data as { email?: string | null }).email ?? '');
    const ask = madeUpName(currentName, email);
    setNeeded(ask);
    if (ask) setName('');
    else leaveRef.current();
  }, [me.data, me.isError, needed]);

  const validName = name.trim().length > 0;

  const submit = async () => {
    if (!validName) {
      setSubmitted(true);
      inputRef.current?.focus();
      return;
    }
    try {
      await updateUser.mutateAsync({ name: name.trim() });
      await utils.user.me.invalidate();
      leave();
    } catch {
      /* the error line below explains it; the name stays */
    }
  };

  if (needed !== true) return <AppLoader />;

  const inviter = intro && (intro.state === 'waiting' || intro.state === 'connected') ? intro.person : null;
  const showError = submitted && !validName;

  return (
    <OnboardingFrame
      top={end ? <BackLink label={t('common.back')} to={introPath(next)} /> : <BrandLine />}
      foot={
        <Button className="w-full" loading={updateUser.isPending} onClick={() => void submit()}>
          {t('intro.seed.go')}
        </Button>
      }
    >
      <div className="mt-1">
        <StepText title={t('intro.seed.nameTitle')}>{t('intro.seed.nameHint')}</StepText>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Card className="mt-5">
          <label htmlFor="seed-name" className="mb-1.5 block text-label font-semibold text-ink-muted">
            {t('intro.seed.name')}
          </label>
          <input
            ref={inputRef}
            id="seed-name"
            value={name}
            maxLength={100}
            autoComplete="name"
            autoFocus
            placeholder={t('intro.seed.namePlaceholder')}
            aria-invalid={showError || undefined}
            aria-describedby={showError ? 'seed-name-error' : undefined}
            onChange={(event) => setName(event.target.value)}
            className="h-12 w-full rounded-md bg-canvas px-3.5 text-body font-semibold text-ink outline-none placeholder:text-ink-subtle"
          />
          {showError ? (
            <p id="seed-name-error" className="mt-1.5 text-label font-semibold text-sos">
              {t('intro.seed.nameMin')}
            </p>
          ) : null}
          {updateUser.isError ? (
            <p role="alert" className="mt-2 text-label font-semibold text-sos">
              {t('intro.seed.failed')}
            </p>
          ) : null}
        </Card>
      </form>

      {inviter ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-care-soft px-3.5 py-3 text-caption text-ink">
          <i className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface text-care">
            <CheckMark className="h-5 w-5" />
          </i>
          <span>
            {intro?.state === 'connected' ? (
              <b className="font-bold">{t('intro.seed.connected', { name: inviter.name })}</b>
            ) : (
              <>
                <b className="font-bold">{t('intro.seed.sent')}</b> {t('intro.seed.sentText', { name: inviter.name.split(/\s+/)[0] })}
              </>
            )}
          </span>
        </div>
      ) : null}
    </OnboardingFrame>
  );
}
