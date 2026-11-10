import { useTranslation } from 'react-i18next';
import { formatMoney } from '../ui2/format';

type Side = { count: number; totalAmount: number };

type Props = {
  given: Side;
  received: Side;
  facts?: { reported: number; marked: number } | null;
};

/**
 * Lifetime participation at the top of the Needs screen (replaces the old
 * "Helped / Helped me" half-circle). Two equal columns, no proportion or
 * balance between them: it is a record, not a ledger.
 */
export function ParticipationSummary({ given, received, facts }: Props) {
  const { t } = useTranslation();
  if (given.count === 0 && received.count === 0) return null;

  return (
    <section className="mb-2 mt-2 rounded-lg bg-surface shadow-card" aria-labelledby="participation-summary-title">
      <h2 id="participation-summary-title" className="px-4 pt-3 text-label font-bold text-ink-muted">
        {t('participationSummary.title')}
      </h2>
      <div className="grid grid-cols-2 divide-x divide-line-soft py-3">
        <Column amount={given.totalAmount} label={t('participationSummary.gave')} count={given.count} accent />
        <Column amount={received.totalAmount} label={t('participationSummary.received')} count={received.count} />
      </div>
      {facts && facts.reported > 0 ? (
        <p className="border-t border-line-soft px-4 py-3 text-label font-semibold text-ink-muted">
          {t('participationSummary.marked', { marked: facts.marked, reported: facts.reported })}
        </p>
      ) : null}
    </section>
  );
}

function Column({ amount, label, count, accent = false }: { amount: number; label: string; count: number; accent?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="min-w-0 px-4">
      <p className={`text-h3 font-extrabold tabular-nums ${accent ? 'text-care' : 'text-ink'}`}>{formatMoney(amount)}</p>
      <p className="mt-0.5 text-body-s font-bold text-ink">{label}</p>
      <p className="mt-0.5 text-label font-semibold text-ink-muted">{t('participationSummary.count', { n: count })}</p>
    </div>
  );
}
