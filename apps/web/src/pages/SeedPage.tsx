import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button, Card, Chip } from '../components/ui2';
import { BackLink, OnboardingFrame, StepText } from '../components/onboarding/OnboardingFrame';
import { CheckMark } from '../components/onboarding/brand';
import { clearFirstRun, introPath, safePath } from '../components/onboarding/flow';

const PRESETS = [1, 5, 15, 30];
const DEFAULT_AMOUNT = 1;

/**
 * Intention (formerly minimum participation) at the start (screens.md §15, onboarding.html №8): the only question before the
 * Circle, so it comes first. 1 $ is preselected, presets 1 / 5 / 15 / 30 or any whole number; a quiet plaque
 * about the request to the inviter. "Back" returns to the intro; "Save and continue" is one tap to the
 * empty Circle. There is no skip: the amount is never left empty.
 */
export function SeedPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Where a newcomer was headed before the intro (an SOS link, say); only same-origin paths
  const next = safePath(params.get('next'));
  const utils = trpc.useUtils();
  const { data: me } = trpc.user.me.useQuery();
  const { data: intro } = trpc.pending.introStatus.useQuery(undefined, { staleTime: 30_000 });
  const setBudget = trpc.user.setMonthlyBudget.useMutation();
  const updateUser = trpc.user.update.useMutation();
  const [name, setName] = useState('');
  const [value, setValue] = useState(String(DEFAULT_AMOUNT));
  const seeded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Someone coming back here already has an amount: start from it instead of 1 $
  useEffect(() => {
    if (seeded.current || !me) return;
    seeded.current = true;
    const current = Math.round(Number((me as { monthlyBudget?: number | null }).monthlyBudget ?? 0));
    if (current >= 1) setValue(String(current));
    // An e-mail sign-up starts with a name taken from the address ("anna.k" from anna.k@…): nobody would
    // recognise that in their circle, so the field starts empty and asks for a real name instead
    const currentName = String((me as { name?: string | null }).name ?? '');
    const email = String((me as { email?: string | null }).email ?? '');
    const fromAddress = !!email && currentName === (email.split('@')[0] ?? '');
    setName(fromAddress ? '' : currentName);
  }, [me]);

  const amount = value === '' ? NaN : Number(value);
  const validAmount = Number.isInteger(amount) && amount >= 1;
  const validName = name.trim().length > 0;
  const valid = validAmount && validName;

  const submit = async () => {
    if (!valid) return;
    try {
      await updateUser.mutateAsync({ name: name.trim() });
      await setBudget.mutateAsync({ amount, inputCurrency: 'USD' });
      await utils.user.me.invalidate();
      clearFirstRun();
      navigate(next ?? '/', { replace: true });
    } catch {
      /* the error line below explains it; the amount stays */
    }
  };

  const inviter = intro && (intro.state === 'waiting' || intro.state === 'connected') ? intro.person : null;

  return (
    <OnboardingFrame
      top={<BackLink label={t('common.back')} to={introPath(next)} />}
      foot={
        <Button className="w-full" loading={setBudget.isPending || updateUser.isPending} disabled={!valid} onClick={() => void submit()}>
          {t('intro.seed.go')}
        </Button>
      }
    >
      <div className="mt-1">
        <StepText title={t('intro.seed.title')}>{t('intro.seed.text', { canHelp: t('circle.stats.canHelp') })}</StepText>
      </div>
      <form
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
            id="seed-name"
            value={name}
            maxLength={100}
            autoComplete="name"
            placeholder={t('intro.seed.namePlaceholder')}
            aria-invalid={!validName || undefined}
            onChange={(event) => setName(event.target.value)}
            className="h-12 w-full rounded-md bg-canvas px-3.5 text-body font-semibold text-ink outline-none placeholder:text-ink-subtle"
          />
          <p className={`mb-4 mt-1.5 text-label ${validName ? 'text-ink-muted' : 'font-semibold text-sos'}`}>
            {validName ? t('intro.seed.nameHint') : t('intro.seed.nameMin')}
          </p>
          <label htmlFor="seed-amount" className="mb-1.5 block text-label font-semibold text-ink-muted">
            {t('intro.seed.label')}
          </label>
          <div
            className={`flex h-[72px] items-baseline gap-1.5 border-b-2 ${!validAmount && value !== '' ? 'border-sos' : value === '' ? 'border-line-strong' : 'border-transparent'}`}
            onClick={() => inputRef.current?.focus()}
          >
            <input
              ref={inputRef}
              id="seed-amount"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={value}
              style={{ width: `${Math.max(1, value.length) + 0.1}ch` }}
              aria-invalid={!validAmount || undefined}
              aria-describedby="seed-hint"
              onChange={(event) => setValue(event.target.value.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, 7))}
              className="min-w-[1ch] max-w-full bg-transparent text-display font-extrabold tabular-nums text-ink caret-care outline-none placeholder:text-ink-subtle"
              placeholder="1"
            />
            <span className="text-[24px] font-bold leading-none tracking-tight text-ink-muted">$</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('intro.seed.presets')}>
            {PRESETS.map((p) => {
              const on = amount === p;
              return (
                <Chip
                  key={p}
                  variant="preset"
                  active={on}
                  aria-pressed={on}
                  onClick={() => setValue(String(p))}
                  className={on ? 'h-10 rounded-md px-4 text-body-s' : 'h-10 rounded-md bg-canvas px-4 text-body-s text-ink shadow-none'}
                >
                  {p}
                </Chip>
              );
            })}
          </div>
          <p id="seed-hint" className={`mt-2.5 text-label ${!validAmount ? 'font-semibold text-sos' : 'text-ink-muted'}`}>
            {!validAmount ? t('intro.seed.min') : t('intro.seed.hint')}
          </p>
          {setBudget.isError || updateUser.isError ? (
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
