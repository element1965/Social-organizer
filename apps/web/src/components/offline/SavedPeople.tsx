import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSavedCopy } from '../../hooks/useSavedCopy';
import { Button } from '../ui2/Button';
import { Group } from '../ui2/Group';
import { Input } from '../ui2/Input';
import { PersonRow } from '../ui2/PersonRow';
import { Screen } from '../ui2/Screen';
import { OfflineHint, OfflineNotice } from './OfflineNotice';

const SEARCH_FROM = 8;

/** Offline home and people list: the people saved on this device, grouped by handshake level (direct first). */
export function SavedPeople({ title }: { title: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { status, model } = useSavedCopy(true);
  const [query, setQuery] = useState('');
  const needle = query.trim().toLocaleLowerCase();

  const groups = useMemo(() => {
    if (!model) return [];
    return ([1, 2, 3] as const)
      .map((level) => ({
        level,
        list: model.levels[level].filter(
          (p) => !needle || p.name.toLocaleLowerCase().includes(needle) || p.accountName.toLocaleLowerCase().includes(needle),
        ),
      }))
      .filter((group) => group.list.length > 0);
  }, [model, needle]);

  return (
    <Screen title={title} width="column">
      <div className="flex flex-col gap-3 pt-2">
        <OfflineNotice syncedAt={model?.syncedAt} />
        <div>
          <Button className="w-full" disabled aria-describedby="offline-need-hint">
            {t('nav.ask')}
          </Button>
          <OfflineHint id="offline-need-hint" />
        </div>
        {model && model.total >= SEARCH_FROM ? (
          <Input
            variant="search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('people.search')}
            aria-label={t('people.search')}
          />
        ) : null}
      </div>

      {status === 'loading' ? (
        <div className="mt-4 flex flex-col gap-2" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      ) : !model || model.total === 0 ? (
        <p className="mt-8 text-center text-body-s font-semibold text-ink-muted">{t('offline.empty')}</p>
      ) : groups.length === 0 ? (
        <p className="mt-8 text-center text-body-s font-semibold text-ink-muted">{t('people.notFound')}</p>
      ) : (
        <>
          {groups.map(({ level, list }) => (
            <Group key={level} title={t('people.title', { ring: t(`circle.rings.full${level}`), count: list.length })} stagger>
              {list.map((person) => (
                <PersonRow
                  key={person.id}
                  name={person.name}
                  subtitle={
                    level === 1
                      ? person.accountName !== person.name
                        ? person.accountName
                        : undefined
                      : person.via.length
                        ? t('people.via', { path: person.via.join(' → ') })
                        : undefined
                  }
                  onClick={level === 1 ? () => navigate(`/person/${person.id}`) : undefined}
                />
              ))}
            </Group>
          ))}
          <p className="mt-4 px-1 text-label font-semibold text-ink-muted">{t('offline.tapHint')}</p>
        </>
      )}
    </Screen>
  );
}
