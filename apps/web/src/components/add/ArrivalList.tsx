import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Group } from '../ui2/Group';
import { Input } from '../ui2/Input';
import { Segmented } from '../ui2/Segmented';
import { IconChevron } from '../ui2/icons';

export interface ArrivalPerson {
  id: string;
  name: string;
  photoUrl?: string | null;
  at: Date;
}

interface ArrivalListProps {
  pending: Array<ArrivalPerson & { pendingId: string }>;
  connected: ArrivalPerson[];
  onConfirm: (person: ArrivalPerson & { pendingId: string }) => void;
}

type Sort = 'new' | 'name';

/** Rows shown at once; "Show more" adds the next page. */
const PAGE = 20;
/** Search and sorting appear once the list no longer fits a screen or two. */
const TOOLS_FROM = 10;

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDay(date: Date, language: string, month: 'long' | 'short'): string {
  return new Intl.DateTimeFormat(language, { day: 'numeric', month }).format(date);
}

export function ArrivalList({ pending, connected, onConfirm }: ArrivalListProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage || i18n.language || 'en';
  const total = pending.length + connected.length;
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [shown, setShown] = useState(PAGE);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const when = (date: Date): string => {
    if (sameDay(date, today)) return t('add.whenToday');
    if (sameDay(date, yesterday)) return t('add.whenYesterday');
    return formatDay(date, language, 'long');
  };

  const since = (date: Date): string => {
    if (sameDay(date, today)) return t('add.inCircleToday');
    if (sameDay(date, yesterday)) return t('add.inCircleYesterday');
    return t('add.inCircleSince', { date: formatDay(date, language, 'long') });
  };

  const needle = query.trim().toLocaleLowerCase(language);
  const match = (p: ArrivalPerson) => !needle || p.name.toLocaleLowerCase(language).includes(needle);

  // Requests to confirm always stay on top and are never paged: they are what needs doing
  const waiting = useMemo(() => pending.filter(match), [pending, needle]); // eslint-disable-line react-hooks/exhaustive-deps
  const people = useMemo(() => {
    const list = connected.filter(match);
    const collator = new Intl.Collator(language, { sensitivity: 'base' });
    return list.sort((a, b) => (sort === 'name' ? collator.compare(a.name, b.name) : b.at.getTime() - a.at.getTime()));
  }, [connected, needle, sort, language]); // eslint-disable-line react-hooks/exhaustive-deps
  const visible = people.slice(0, shown);
  const left = people.length - visible.length;
  const tools = total > TOOLS_FROM;

  return (
    <section>
      <div className="mb-1.5 mt-4 flex items-baseline justify-between gap-3 px-1">
        <h2 className="text-label font-bold text-ink-muted">{t('add.arrivals', { count: total })}</h2>
        {pending.length > 0 ? (
          <span className="text-label font-bold text-warm-ink">{t('add.waiting', { count: pending.length })}</span>
        ) : null}
      </div>
      {tools ? (
        <div className="mb-2.5 flex flex-col gap-2">
          <Input
            variant="search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setShown(PAGE);
            }}
            placeholder={t('people.search')}
            aria-label={t('people.search')}
          />
          <Segmented
            label={t('add.sortLabel')}
            value={sort}
            onChange={(value) => {
              setSort(value);
              setShown(PAGE);
            }}
            options={[
              { value: 'new', label: t('add.sortNew') },
              { value: 'name', label: t('add.sortName') },
            ]}
          />
        </div>
      ) : null}
      {waiting.length + visible.length === 0 ? (
        <p className="mt-6 text-center text-body-s font-semibold text-ink-muted">{t('people.notFound')}</p>
      ) : (
        <Group>
          {waiting.map((person) => (
            <button
              key={person.pendingId}
              type="button"
              onClick={() => onConfirm(person)}
              className="so-focus flex min-h-row w-full items-center gap-3 px-4 py-2 text-left"
            >
              <Avatar name={person.name} src={person.photoUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-body text-ink">{person.name}</span>
                <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">
                  {when(person.at)}
                  {' · '}
                  <span className="text-warm-ink">{t('add.confirmCue')}</span>
                </span>
              </span>
              <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
            </button>
          ))}
          {visible.map((person) => (
            <Link key={person.id} to={`/person/${person.id}`} className="so-focus flex min-h-row w-full items-center gap-3 px-4 py-2 text-left">
              <Avatar name={person.name} src={person.photoUrl} size={40} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-body font-body text-ink">{person.name}</span>
                <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{since(person.at)}</span>
              </span>
              <span className="shrink-0 text-micro font-semibold text-ink-muted">{formatDay(person.at, language, 'short')}</span>
            </Link>
          ))}
        </Group>
      )}
      {left > 0 ? (
        <Button variant="secondary" className="mt-3 w-full" onClick={() => setShown((n) => n + PAGE)}>
          {t('add.showMore', { total: left })}
        </Button>
      ) : null}
    </section>
  );
}
