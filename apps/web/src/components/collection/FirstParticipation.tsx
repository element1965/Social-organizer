import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MIN_OBLIGATION_AMOUNT } from '@so/shared';
import { trpc } from '../../lib/trpc';
import { introPath } from '../onboarding/flow';
import { ActionError } from '../errors/ActionError';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { LiveNotice } from '../ui2/LiveNotice';
import { formatMoney } from '../ui2/format';
import { IconCheck } from '../circle/icons';

/**
 * "What happens now" (audit A3): shown once, to a newcomer, right after their first Participation on the Need page.
 * A newcomer who came by a public Need link reaches the Need before any teaching; this card says what the
 * Participation set in motion, offers to keep the amount as their intention (never set silently: "Not now" keeps
 * the current one) and offers the intro to the network. Nothing here is automatic.
 */
export function FirstParticipation({
  authorName,
  amount,
  intention,
  firstHandshake,
  hasChat,
}: {
  /** The author's name, nominative ("Anna") */
  authorName: string;
  /** The amount just reported */
  amount: number;
  /** The person's intention now (monthlyBudget), or null while it is not known */
  intention: number | null;
  /** Opening this Need earned the first connection milestone. */
  firstHandshake: boolean;
  /** The participant can open the author's chat link from the card above. */
  hasChat: boolean;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const [declined, setDeclined] = useState(false);
  const keep = trpc.user.setMonthlyBudget.useMutation({
    meta: { notifyOnError: false },
    onSuccess: () => {
      void utils.user.me.invalidate();
      void utils.stats.networkFigure.invalidate();
    },
  });
  const offer = intention != null && amount >= MIN_OBLIGATION_AMOUNT && amount !== Math.round(intention) && !declined;
  const money = formatMoney(amount);

  const lines = [
    t('collection.firstNext.seen', { name: authorName }),
    hasChat ? t('collection.firstNext.chat') : null,
    firstHandshake ? t('intro.seed.connected', { name: authorName }) : null,
  ].filter((line): line is string => !!line);

  return (
    <Card className="mt-3">
      <h2 className="text-body font-extrabold">{t('collection.firstNext.title')}</h2>
      <ul className="mt-2 flex list-none flex-col gap-2 p-0">
        {lines.map((line) => (
          <li key={line} className="grid grid-cols-[20px_1fr] items-start gap-2.5 text-caption font-semibold text-ink">
            <IconCheck className="mt-0.5 h-4 w-4 text-care" aria-hidden />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {keep.isSuccess ? (
        <p className="mt-4 rounded-lg bg-care-soft px-3.5 py-3 text-caption font-semibold text-ink">
          {t('collection.firstNext.kept', { amount: money })}
        </p>
      ) : offer ? (
        <div className="mt-4 rounded-lg bg-canvas px-3.5 py-3">
          <p className="text-caption font-extrabold text-ink">{t('collection.firstNext.keepQuestion', { amount: money })}</p>
          <p className="mt-1 text-label font-semibold text-ink-muted">
            {t('collection.firstNext.keepWhy')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant="secondary" size="md" className="w-full" onClick={() => setDeclined(true)} disabled={keep.isPending}>
              {t('invite.notNow')}
            </Button>
            <Button size="md" className="w-full" loading={keep.isPending} onClick={() => keep.mutate({ amount, inputCurrency: 'USD' })}>
              {t('collection.firstNext.keepYes', { amount: money })}
            </Button>
          </div>
          <ActionError error={keep.error} />
        </div>
      ) : null}
      <LiveNotice>{keep.isSuccess ? t('collection.firstNext.kept', { amount: money }) : null}</LiveNotice>

      <Button variant="secondary" className="mt-4 w-full" onClick={() => navigate(introPath())}>
        {t('collection.firstNext.intro')}
      </Button>
    </Card>
  );
}
