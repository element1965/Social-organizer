import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { QueryState } from './QueryState';
import { formatDayMonth } from './dates';

const STEPS = ['opened', 'signedUp', 'requested', 'connected', 'five', 'unlocked'] as const;

const cell = 'px-2 py-2 text-right text-label font-semibold tabular-nums text-ink';
const head = 'px-2 py-2 text-right align-bottom text-micro font-bold text-ink-muted';

/**
 * Admin statistics → Funnel: weekly sign-up cohorts from an opened invite to an open Need, the ways of
 * inviting that bring connections, and newcomers per active person. Counts only, no names.
 */
export function FunnelPanel() {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const funnel = trpc.stats.adminFunnel.useQuery(undefined, { staleTime: 60_000 });

  if (funnel.isLoading || funnel.isError || !funnel.data) {
    return <QueryState isLoading={funnel.isLoading} isError={funnel.isError} onRetry={() => void funnel.refetch()} />;
  }
  const { weeks, sources, ratios } = funnel.data;

  return (
    <>
      <p className="mt-4 px-1 text-caption font-semibold text-ink-muted">{t('adminStats.funnel.note')}</p>
      <div className="mt-2 overflow-x-auto rounded-lg bg-surface shadow-card">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line-soft">
              <th scope="col" className={`${head} text-left`}>{t('adminStats.funnel.week')}</th>
              {STEPS.map((step) => (
                <th key={step} scope="col" className={head}>{t(`adminStats.funnel.${step}`)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((week) => (
              <tr key={week.weekStart} className="border-b border-line-soft last:border-b-0">
                <th scope="row" className="whitespace-nowrap px-2 py-2 text-left text-label font-bold text-ink-muted">
                  {formatDayMonth(`${week.weekStart}T00:00:00Z`, language)}
                </th>
                {STEPS.map((step) => (
                  <td key={step} className={cell}>{week[step]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mb-1.5 mt-5 px-1 text-label font-bold text-ink-muted">{t('adminStats.funnel.sources')}</h2>
      <div className="overflow-x-auto rounded-lg bg-surface shadow-card">
        {sources.length === 0 ? (
          <p className="py-6 text-center text-body-s font-semibold text-ink-muted">{t('adminStats.noResults')}</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-line-soft">
                <th scope="col" className={`${head} text-left`}>{t('adminStats.funnel.source')}</th>
                <th scope="col" className={head}>{t('adminStats.funnel.opened')}</th>
                <th scope="col" className={head}>{t('adminStats.funnel.requests')}</th>
                <th scope="col" className={head}>{t('adminStats.funnel.connections')}</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((row) => (
                <tr key={row.source} className="border-b border-line-soft last:border-b-0">
                  <th scope="row" className="px-2 py-2 text-left text-label font-bold text-ink">{row.source}</th>
                  <td className={cell}>{row.opened}</td>
                  <td className={cell}>{row.requests}</td>
                  <td className={cell}>{row.connections}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <h2 className="mb-1.5 mt-5 px-1 text-label font-bold text-ink-muted">{t('adminStats.funnel.perActive')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {ratios.map((ratio) => (
          <div key={ratio.days} className="rounded-lg bg-surface px-3 py-3 text-center shadow-card">
            <p className="text-h3 font-extrabold tabular-nums text-ink">{ratio.perActive === null ? '—' : ratio.perActive.toFixed(2)}</p>
            <p className="text-micro font-bold text-ink-muted">
              {t('adminStats.funnel.days', { count: ratio.days })} · {ratio.newcomersConnected} / {ratio.active}
            </p>
          </div>
        ))}
      </div>
    </>
  );
}
