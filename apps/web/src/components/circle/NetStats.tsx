import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { formatMoney } from '../ui2/format';

type NetStatsProps = {
  people: number;
  canHelp: number;
  /** Week delta. Not in the API yet (ux-audit §7.1 p.6): hidden while undefined. */
  weekDelta?: number;
  variant: 'scene' | 'card';
  className?: string;
};

/** "N people in the network" and "The network can help". Tap explains the sum. */
export function NetStats({ people, canHelp, weekDelta, variant, className }: NetStatsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const delta = weekDelta && weekDelta > 0 ? t('circle.stats.weekDelta', { amount: formatMoney(weekDelta) }) : null;

  const body =
    variant === 'scene' ? (
      <span className="flex w-full items-end justify-between gap-3 text-left">
        <span className="min-w-0">
          <b className="block truncate text-[17px] font-extrabold tracking-tight text-node-1">
            {t('circle.stats.people', { count: people })}
          </b>
          <span className="mt-0.5 block text-label font-semibold text-node-2">{t('circle.stats.canHelp')}</span>
        </span>
        <span className="shrink-0 text-right">
          <b className="block text-h3 font-extrabold tabular-nums text-node-1">{formatMoney(canHelp)}</b>
          {delta ? <span className="block text-label font-bold text-care-scene">{delta}</span> : null}
        </span>
      </span>
    ) : (
      <span className="block w-full text-left">
        <span className="block text-label font-bold text-ink-muted">{t('circle.stats.canHelp')}</span>
        <span className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="text-h2 font-extrabold tabular-nums text-ink">{formatMoney(canHelp)}</b>
          <span className="text-caption font-semibold text-ink-muted">{t('circle.stats.peopleShort', { count: people })}</span>
          {delta ? <span className="text-caption font-bold text-care">{delta}</span> : null}
        </span>
      </span>
    );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={cn(
          'so-focus block w-full',
          variant === 'card' && 'rounded-xl bg-surface p-4 shadow-card',
          variant === 'scene' && 'rounded-md',
          className,
        )}
      >
        {body}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={t('circle.stats.canHelp')}
        description={t('circle.stats.explain')}
        footer={
          <Button variant="secondary" onClick={() => setOpen(false)}>
            {t('common.close')}
          </Button>
        }
      />
    </>
  );
}
