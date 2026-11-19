import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ASK_MIN_DIRECT } from '@so/shared';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';
import { formatMoney } from '../ui2/format';
import { IconCheck } from './icons';

type StartCardProps = {
  /** My intention (monthlyBudget), or null while it is not known */
  intention: number | null;
  direct: number;
  /** An outgoing request already counts as the first person in progress. */
  waiting: boolean;
};

function Step({ n, title, sub, done }: { n: number; title: string; sub: string; done: boolean }) {
  return (
    <>
      <i
        className={cn(
          'grid h-8 w-8 place-items-center rounded-full text-caption font-extrabold not-italic',
          done ? 'bg-care text-care-on' : 'bg-surface-2 text-ink-muted',
        )}
        aria-hidden
      >
        {done ? <IconCheck className="h-4 w-4" /> : n}
      </i>
      <span className="flex min-w-0 flex-col gap-0.5">
        <b className={cn('text-body font-bold tracking-tight', done ? 'text-ink-muted' : 'text-ink')}>{title}</b>
        <small className="text-label font-semibold text-ink-muted">{sub}</small>
      </span>
    </>
  );
}

const ROW = 'grid min-h-[58px] grid-cols-[32px_1fr] items-center gap-3 [&+&]:border-t [&+&]:border-line-soft';

/**
 * "You are first": a checklist and one button, instead of the feed in an empty circle. The first step is the
 * intention: the person meets the amount here, after seeing the Circle, not on a screen before it (audit A12).
 * It is what the network figure is made of, so the row says so and opens My intention.
 */
export function StartCard({ intention, direct, waiting }: StartCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const amount = intention == null ? null : Math.round(intention);
  return (
    <div>
      <div className="rounded-xl bg-surface px-4 pb-1.5 pt-3.5 shadow-card">
        <p className="mb-1 text-caption text-ink-muted">
          <b className="text-ink">{t('circle.start.lead')}</b> {t('circle.start.body')}
        </p>
        <ol className="list-none p-0">
          <li className={ROW}>
            <button
              type="button"
              onClick={() => navigate('/me/stake')}
              className="so-focus col-span-2 grid grid-cols-[32px_1fr_auto] items-center gap-3 py-2 text-start"
            >
              <i className="grid h-8 w-8 place-items-center rounded-full bg-care-soft text-caption font-extrabold not-italic text-care" aria-hidden>
                1
              </i>
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="text-body font-bold tracking-tight text-ink">
                  {amount == null ? t('circle.start.intention') : t('circle.start.intentionIs', { amount: formatMoney(amount) })}
                </b>
                <small className="text-label font-semibold text-ink-muted">{t('circle.start.intentionSub')}</small>
              </span>
              <span className="text-caption font-extrabold text-care">{t('collection.change')}</span>
            </button>
          </li>
          <li className={ROW}>
            <Step
              n={2}
              title={t('circle.start.step2')}
              sub={waiting ? t('circle.start.step2Waiting') : t('circle.start.step2Sub')}
              done={direct > 0}
            />
          </li>
          <li className={ROW}>
            <Step
              n={3}
              title={t('path.circle')}
              sub={t('path.of', { count: Math.min(direct, ASK_MIN_DIRECT), goal: ASK_MIN_DIRECT })}
              done={direct >= ASK_MIN_DIRECT}
            />
          </li>
        </ol>
      </div>
      <Button className="mt-2.5 w-full" onClick={() => navigate('/add')}>
        {t('nav.addPerson')}
      </Button>
    </div>
  );
}
