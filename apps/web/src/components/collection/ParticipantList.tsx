import { useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { Avatar } from '../ui2/Avatar';
import { formatMoney } from '../ui2/format';
import { IconCheck } from './icons';

export type ParticipantRow = {
  id: string;
  userId: string;
  name: string;
  photoUrl: string | null;
  amount: number;
  paid: boolean;
  subtitle: string;
  mine: boolean;
  joinedViaLink: boolean;
};

type ParticipantListProps = {
  people: ParticipantRow[];
  showPaid: boolean;
  onPerson?: (userId: string) => void;
  onPaid?: (row: ParticipantRow) => void;
  onRemove?: (row: ParticipantRow) => void;
  /** Opens the "Mark transfers" sheet. Shown while two or more transfers are not marked. */
  onMarkMany?: () => void;
};

export function ParticipantList({ people, showPaid, onPerson, onPaid, onRemove, onMarkMany }: ParticipantListProps) {
  const { t } = useTranslation();

  // For the author: unmarked first. The order is taken when a row is first seen, so a row does not
  // jump away under the finger when it is marked; it moves down on the next visit.
  // Both the paid flag and the position are taken at first sight: the server may return the rows in
  // another order after a change, and the row must still stay where it was
  const firstSeen = useRef<Map<string, { paid: boolean; order: number }>>(new Map());
  const rows = useMemo(() => {
    if (!showPaid) return people;
    const seen = firstSeen.current;
    for (const row of people) if (!seen.has(row.id)) seen.set(row.id, { paid: row.paid, order: seen.size });
    const key = (row: ParticipantRow) => seen.get(row.id)!;
    return [...people].sort((a, b) => Number(key(a).paid) - Number(key(b).paid) || key(a).order - key(b).order);
  }, [people, showPaid]);

  const paid = people.filter((row) => row.paid);
  const unpaidCount = people.length - paid.length;
  const paidSum = paid.reduce((acc, row) => acc + row.amount, 0);
  const allSum = people.reduce((acc, row) => acc + row.amount, 0);

  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="text-label font-bold text-ink-muted">{t('collection.participantsCount', { count: people.length })}</h2>
        {showPaid ? <span className="text-label font-bold text-ink-muted">{t('collection.transferred')}</span> : null}
      </div>
      {showPaid && people.length > 0 ? (
        <div className="mb-2 flex items-center gap-3 px-1">
          <p className="min-w-0 flex-1 text-caption font-semibold text-ink-muted">
            {t('collection.receivedSummary', {
              paid: paid.length,
              total: people.length,
              sum: formatMoney(paidSum),
              all: formatMoney(allSum),
            })}
          </p>
          {onMarkMany && unpaidCount >= 2 ? (
            <button type="button" onClick={onMarkMany} className="so-focus h-9 shrink-0 rounded-md px-1 text-caption font-bold text-care">
              {t('collection.markTransfers')}
            </button>
          ) : null}
        </div>
      ) : null}
      {people.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-body-s font-semibold text-ink-muted shadow-card">
          {t('collection.emptyPeople')}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg bg-surface shadow-card">
          {rows.map((person) => (
            <li key={person.id} className="flex min-h-row items-center gap-3 px-4 py-2">
              <Avatar name={person.name} src={person.photoUrl} size={40} />
              <span className="min-w-0 flex-1">
                <button type="button" className="so-focus block max-w-full text-left" onClick={() => onPerson?.(person.userId)}>
                  <span className="block truncate text-body font-body text-ink">{person.name}</span>
                  <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{person.subtitle}</span>
                </button>
                {person.joinedViaLink && onRemove ? (
                  <button type="button" className="so-focus mt-1 text-micro font-bold text-sos" onClick={() => onRemove(person)}>
                    {t('collection.removeFromCircle')}
                  </button>
                ) : null}
              </span>
              <span className={cn('text-body font-extrabold tabular-nums', person.mine ? 'text-care' : 'text-ink')}>
                {formatMoney(person.amount)}
              </span>
              {showPaid ? (
                <button
                  type="button"
                  aria-pressed={person.paid}
                  aria-label={t('collection.paidToggle', { name: person.name })}
                  onClick={() => onPaid?.(person)}
                  // 44 px hit area around the 28 px box
                  className={cn(
                    'so-focus relative grid h-7 w-7 place-items-center rounded-sm border transition-colors duration-150 before:absolute before:-inset-2',
                    person.paid ? 'border-care bg-care text-care-on' : 'border-line bg-canvas text-transparent',
                  )}
                >
                  <IconCheck className="h-4 w-4" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
