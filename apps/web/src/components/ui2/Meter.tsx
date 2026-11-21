import { useTranslation } from 'react-i18next';
import { formatIsolatedMoney, formatMoney } from './format';

type MeterProps = {
  mine: number;
  others: number;
  goal: number;
  /** Authors do not get a "you" segment. Defaults to showing it when mine is above zero. */
  showMine?: boolean;
};

export function Meter({ mine, others, goal, showMine }: MeterProps) {
  const { t } = useTranslation();
  const participate = showMine ?? mine > 0;
  const safeGoal = goal > 0 ? goal : 1;
  const minePct = participate ? Math.min(100, (mine / safeGoal) * 100) : 0;
  const othersPct = Math.min(100 - minePct, (Math.max(0, others) / safeGoal) * 100);
  const restLabel = participate ? t('common.others') : t('common.collected');
  const restAmount = participate ? others : others + (participate ? 0 : mine);

  return (
    <div>
      <div className="mt-3 flex h-3 overflow-hidden rounded-sm bg-surface-2" role="img" aria-label={`${t('common.collected')} ${formatIsolatedMoney(mine + others)}`}>
        {minePct > 0 ? <i className="block h-full bg-ink transition-[width] duration-screen ease-so motion-reduce:transition-none" style={{ width: `${minePct}%` }} /> : null}
        {othersPct > 0 ? <i className="block h-full bg-care transition-[width] duration-screen ease-so motion-reduce:transition-none" style={{ width: `${othersPct}%` }} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-label font-semibold tabular-nums text-ink-muted">
        {participate ? (
          <span className="inline-flex items-center gap-1.5">
            <i className="h-2 w-2 rounded-full bg-ink" />
            <span>{t('common.you')} <bdi dir="ltr">{formatMoney(mine)}</bdi></span>
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5">
          <i className="h-2 w-2 rounded-full bg-care" />
          <span>{restLabel} <bdi dir="ltr">{formatMoney(restAmount)}</bdi></span>
        </span>
        <b className="ms-auto font-semibold text-ink">
          {t('common.goal')} <bdi dir="ltr">{formatMoney(goal)}</bdi>
        </b>
      </div>
    </div>
  );
}
