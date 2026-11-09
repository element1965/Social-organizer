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
};

export function ParticipantList({ people, showPaid, onPerson, onPaid, onRemove }: ParticipantListProps) {
  const { t } = useTranslation();

  return (
    <section className="mt-4">
      <div className="mb-1.5 flex items-center justify-between px-1">
        <h2 className="text-label font-bold text-ink-muted">{t('collection.participantsCount', { count: people.length })}</h2>
        {showPaid ? <span className="text-label font-bold text-ink-muted">{t('collection.transferred')}</span> : null}
      </div>
      {people.length === 0 ? (
        <p className="rounded-lg bg-surface px-4 py-6 text-center text-body-s font-semibold text-ink-muted shadow-card">
          {t('collection.emptyPeople')}
        </p>
      ) : (
        <ul className="divide-y divide-line-soft overflow-hidden rounded-lg bg-surface shadow-card">
          {people.map((person) => (
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
                  aria-label={person.paid ? t('collection.payUndoTitle', { name: person.name }) : t('collection.payTitle', { name: person.name })}
                  onClick={() => onPaid?.(person)}
                  className={cn(
                    'so-focus grid h-7 w-7 place-items-center rounded-sm border',
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
