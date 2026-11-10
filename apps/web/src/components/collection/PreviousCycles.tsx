import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { trpc } from '../../lib/trpc';
import { useNicknames } from '../../hooks/useNicknames';
import { Avatar } from '../ui2/Avatar';
import { formatMoney } from '../ui2/format';
import { IconChevron } from '../ui2/icons';
import { asDate, formatDay } from './text';

/**
 * The author's own record of "received" marks for finished cycles of a regular collection.
 * Private to the author: the server refuses anyone else, and the block is only rendered for the author.
 * Hidden while there is no history.
 */
export function PreviousCycles({ collectionId }: { collectionId: string }) {
  const { t, i18n } = useTranslation();
  const resolve = useNicknames();
  const history = trpc.obligation.receiptHistory.useQuery({ collectionId });
  const [open, setOpen] = useState(false);
  const [openCycle, setOpenCycle] = useState<number | null>(null);

  const cycles = history.data?.cycles ?? [];
  if (cycles.length === 0) return null;

  const period = (start: string | Date | null, end: string | Date | null) => {
    const a = asDate(start);
    const b = asDate(end);
    return a && b ? `${formatDay(a, i18n.language)} – ${formatDay(b, i18n.language)}` : '';
  };

  return (
    <section className="mt-4 rounded-xl bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={open}
        className="so-focus flex min-h-row w-full items-center gap-3 rounded-xl px-4 py-3 text-start"
        onClick={() => setOpen((value) => !value)}
      >
        <span className="min-w-0 flex-1 text-body font-bold text-ink">{t('collection.cyclesTitle')}</span>
        <IconChevron className={cn('h-[18px] w-[18px] shrink-0 text-ink-subtle', open ? 'rotate-90' : 'rtl:rotate-180')} />
      </button>
      {open ? (
        <ul className="list-none border-t border-line px-2 pb-2 pt-1">
          {cycles.map((cycle) => {
            const expandable = cycle.markedCount > 0;
            const expanded = openCycle === cycle.cycleNumber;
            const dates = period(cycle.startsAt, cycle.endsAt);
            return (
              <li key={cycle.cycleNumber}>
                <button
                  type="button"
                  disabled={!expandable}
                  aria-expanded={expandable ? expanded : undefined}
                  className="so-focus flex min-h-row w-full items-center gap-3 rounded-lg px-2 py-2 text-start"
                  onClick={() => setOpenCycle(expanded ? null : cycle.cycleNumber)}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-s font-bold text-ink">
                      {t('collection.cycleN', { n: cycle.cycleNumber })}
                      {dates ? <span className="font-semibold text-ink-muted"> · {dates}</span> : null}
                    </span>
                    <span className="mt-0.5 block text-label font-semibold text-ink-muted">
                      {expandable
                        ? t('collection.cycleMarked', { count: cycle.markedCount, amount: formatMoney(cycle.markedAmount) })
                        : t('collection.cycleNone')}
                    </span>
                  </span>
                  {expandable ? (
                    <IconChevron className={cn('h-[18px] w-[18px] shrink-0 text-ink-subtle', expanded ? 'rotate-90' : 'rtl:rotate-180')} />
                  ) : null}
                </button>
                {expanded ? (
                  <ul className="list-none pb-1 ps-2">
                    {cycle.marked.map((person) => (
                      <li key={person.userId} className="flex min-h-11 items-center gap-3 px-2 py-1">
                        <Avatar name={resolve(person.userId, person.name)} src={person.photoUrl} size={36} />
                        <span className="min-w-0 flex-1 truncate text-body-s font-semibold text-ink">
                          {resolve(person.userId, person.name)}
                        </span>
                        <span className="text-body-s font-bold tabular-nums text-ink">{formatMoney(person.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
