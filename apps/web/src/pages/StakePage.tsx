import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Chip } from '../components/ui2/Chip';
import { Input } from '../components/ui2/Input';
import { Screen } from '../components/ui2/Screen';
import { formatMoney } from '../components/ui2/format';
import { QueryState } from '../components/profile/QueryState';
import { STAKE_PRESETS } from '../components/profile/constants';
import { useSmartBack } from '../components/profile/useSmartBack';

function parseStake(raw: string): number | null {
  const cleaned = raw.trim().replace(',', '.');
  if (!/^\d+$/.test(cleaned)) return null;
  const amount = Number(cleaned);
  if (!Number.isInteger(amount) || amount < 0) return null;
  return amount;
}

export function StakePage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  const utils = trpc.useUtils();
  const me = trpc.user.me.useQuery();
  const access = trpc.collection.askAccess.useQuery();
  const caps = trpc.stats.networkCapabilities.useQuery(undefined, {
    enabled: access.isSuccess && access.data.networkCanHelp == null,
  });
  const save = trpc.user.setMonthlyBudget.useMutation({
    onSuccess: () => {
      void utils.user.me.invalidate();
      void utils.collection.askAccess.invalidate();
      void utils.stats.networkCapabilities.invalidate();
    },
  });

  const saved = me.data?.monthlyBudget;
  // Not set yet counts as 1 $ everywhere else (a collection's minimum), so the field starts there
  const current = saved == null ? '1' : String(Math.round(saved));
  const [raw, setRaw] = useState<string | null>(null);
  const value = raw ?? current;
  const parsed = parseStake(value);
  const showError = value.trim() !== '' && parsed == null;
  const unchanged = saved != null && parsed === Math.round(saved);
  const canHelp = access.data?.networkCanHelp ?? caps.data?.total ?? null;

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
          {save.isError ? <p className="mt-2 text-label font-semibold text-sos">{t('common.error')}</p> : null}

          <Card className="mt-6" title={t('circle.stats.canHelp')} subtitle={t('circle.stats.explain')}>
            <p className="text-h2 font-extrabold tabular-nums text-ink">
              {canHelp == null ? t('common.loading') : formatMoney(canHelp)}
            </p>
          </Card>
        </>
      )}
    </Screen>
  );
}
