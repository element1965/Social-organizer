import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { formatIsolatedMoney, formatMoney } from '../ui2/format';
import { IconInfo } from './icons';
import { NetFigureSheet } from './NetFigureSheet';

type NetStatsProps = {
  /** null while the figure is loading or unavailable: a placeholder is shown, never 0 */
  people: number | null;
  /** The network figure's sum: what everyone up to the 6th handshake can still give (useNetworkFigure); null as above */
  canHelp: number | null;
  /** Week delta. Not in the API yet (ux-audit §7.1 p.6): hidden while undefined. */
  weekDelta?: number;
  variant: 'header' | 'scene' | 'card';
  className?: string;
};

/** "N people in the network" and "Declared participation of the network" with an ⓘ mark. Tap explains the sum. */
export function NetStats({ people, canHelp, weekDelta, variant, className }: NetStatsProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  // No figure yet (loading, or nothing live or saved): a placeholder, so an empty network (0) stays distinguishable
  const waiting = people == null || canHelp == null;
  const pending = (
    <span className="inline-block h-4 w-16 animate-pulse rounded-sm bg-line align-middle motion-reduce:animate-none" aria-hidden />
  );
  const delta = weekDelta && weekDelta > 0 ? t('circle.stats.weekDelta', { amount: formatIsolatedMoney(weekDelta) }) : null;

  // Nobody yet: "0 people · 0 $" tells nothing, so the header says where the network starts instead (audit A2)
  if (people === 0) {
    return (
      <p
        className={cn(
          'block w-full text-start font-extrabold tracking-tight',
          variant === 'card' ? 'rounded-xl bg-surface p-4 text-body text-ink shadow-card' : 'text-[17px] text-node-1',
          className,
        )}
      >
        {t('circle.stats.empty')}
      </p>
    );
  }

  const body =
    variant === 'header' ? (
      <span className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-3">
        <span className="min-w-0 text-start">
          <b className="block text-h3 font-extrabold tabular-nums text-node-1">{waiting ? pending : people}</b>
          <span className="mt-0.5 block text-label font-semibold text-node-2">{t('circle.stats.peopleLabel')}</span>
        </span>
        <span className="min-w-0 text-end">
          <b className="block text-h3 font-extrabold tabular-nums text-node-1">{waiting ? pending : <bdi dir="ltr">{formatMoney(canHelp ?? 0)}</bdi>}</b>
          <span className="mt-0.5 flex items-start justify-end gap-1 text-label font-semibold text-node-2">
            <span className="text-balance">{t('circle.stats.canHelp')}</span>
            <IconInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          </span>
          {delta ? <span className="block text-label font-bold text-care-scene">{delta}</span> : null}
        </span>
      </span>
    ) : variant === 'scene' ? (
      // The name of the sum takes a line of its own under the two numbers: beside the sum it wrapped on a phone (audit A5)
      <span className="block w-full text-start">
        <span className="flex items-end justify-between gap-3">
          <b className="block min-w-0 truncate text-[17px] font-extrabold tracking-tight text-node-1">
            {waiting ? pending : t('circle.stats.people', { count: people ?? 0 })}
          </b>
          <b className="block shrink-0 text-h3 font-extrabold tabular-nums text-node-1">{waiting ? pending : <bdi dir="ltr">{formatMoney(canHelp ?? 0)}</bdi>}</b>
        </span>
        <span className="mt-0.5 flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-1 text-label font-semibold text-node-2">
            {t('circle.stats.canHelp')}
            <IconInfo className="h-3.5 w-3.5 shrink-0" />
          </span>
          {delta ? <span className="shrink-0 text-label font-bold text-care-scene">{delta}</span> : null}
        </span>
      </span>
    ) : (
      <span className="block w-full text-start">
        <span className="flex items-center gap-1 text-label font-bold text-ink-muted">
          {t('circle.stats.canHelp')}
          <IconInfo className="h-3.5 w-3.5 shrink-0" />
        </span>
        <span className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <b className="text-h2 font-extrabold tabular-nums text-ink">{waiting ? pending : <bdi dir="ltr">{formatMoney(canHelp ?? 0)}</bdi>}</b>
          {waiting ? null : (
            <span className="text-caption font-semibold text-ink-muted">{t('circle.stats.peopleShort', { count: people ?? 0 })}</span>
          )}
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
          variant !== 'card' && 'rounded-md',
          className,
        )}
      >
        {body}
        {waiting ? <span className="sr-only">{t('common.loading')}</span> : null}
      </button>
      <NetFigureSheet open={open} onClose={() => setOpen(false)} />
    </>
  );
}
