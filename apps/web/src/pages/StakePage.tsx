import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_INTENTION_AMOUNT, MIN_INTENTION_AMOUNT, MIN_OBLIGATION_AMOUNT } from '@so/shared';
import { trpc } from '../lib/trpc';
import { useNetworkFigure } from '../hooks/useNetworkFigure';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Chip } from '../components/ui2/Chip';
import { Input } from '../components/ui2/Input';
import { LiveNotice } from '../components/ui2/LiveNotice';
import { Screen } from '../components/ui2/Screen';
import { formatMoney } from '../components/ui2/format';
import { QueryState } from '../components/profile/QueryState';
import { ActionError } from '../components/errors/ActionError';
import { STAKE_PRESETS } from '../components/profile/constants';
import { useSmartBack } from '../components/profile/useSmartBack';

function parseStake(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!/^\d+$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  // The intention rule (packages/shared): 0 is "I can't take part right now", otherwise at least the Participation minimum
  if (!Number.isInteger(amount) || amount < MIN_INTENTION_AMOUNT) return null;
  if (amount > 0 && amount < MIN_OBLIGATION_AMOUNT) return null;
  return amount;
}

export function StakePage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  const { figure } = useNetworkFigure();
  const save = trpc.user.setMonthlyBudget.useMutation({
    meta: { notifyOnError: false },
    onSuccess: () => {
      void utils.user.me.invalidate();
      void utils.stats.networkFigure.invalidate();
      void utils.collection.askAccess.invalidate();
    },
  });

  const saved = me.data?.monthlyBudget;
  // New accounts start with the default intention (1 $); an account without a value starts the field there too
  const current = saved == null ? String(DEFAULT_INTENTION_AMOUNT) : String(Math.round(saved));
  const [raw, setRaw] = useState<string | null>(null);
  const value = raw ?? current;
  const parsed = parseStake(value);
  const showError = value.trim() !== '' && parsed == null;
  const unchanged = saved != null && parsed === Math.round(saved);
  // The network figure, from the query shared with the Circle, the Profile and the Need screen (up to the 6th handshake)
  const canHelp = figure?.canHelp ?? null;

  const submit = () => {
    if (parsed == null) return;
    save.mutate({ amount: parsed, inputCurrency: 'USD' });
  };

  return (
    <Screen title={t('nav.stake')} back={back} width="column">
      {me.isLoading || me.isError || !me.data ? (
        <QueryState isLoading={me.isLoading} isError={me.isError || !me.data} onRetry={() => void me.refetch()} />
      ) : (
        <>
          <div className="mt-2">
            <Input
              variant="money"
              label={t('profile.stakeLabel')}
              value={value}
              onValueChange={setRaw}
              error={showError ? t('profile.stakeMin') : undefined}
              hint={save.isSuccess && unchanged ? t('profile.stakeSaved') : parsed === 0 ? t('profile.stakeNone') : t('profile.stakeHint')}
            />
            <LiveNotice>{save.isSuccess && unchanged ? t('profile.stakeSaved') : null}</LiveNotice>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {STAKE_PRESETS.map((preset) => (
              <Chip
                key={preset}
                variant="preset"
                active={parsed === preset}
                onClick={() => setRaw(String(preset))}
              >
                {formatMoney(preset)}
              </Chip>
            ))}
          </div>
          <Button
            className="mt-6 w-full"
            disabled={parsed == null || unchanged}
            loading={save.isPending}
            onClick={submit}
          >
            {t('common.save')}
          </Button>
          <ActionError error={save.error} />

          <Card className="mt-6" title={t('circle.stats.canHelp')} subtitle={t('circle.stats.explain')}>
            <p className="text-h2 font-extrabold tabular-nums text-ink">
              {canHelp == null ? t('common.loading') : formatMoney(canHelp)}
            </p>
            {/* The same pair as on the Circle, the Profile and the Need screen: the sum and the people behind it */}
            {figure ? (
              <p className="mt-1 text-label font-semibold tabular-nums text-ink-muted">{t('circle.stats.people', { count: figure.people })}</p>
            ) : null}

          </Card>
        </>
      )}
    </Screen>
  );
}
