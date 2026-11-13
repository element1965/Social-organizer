import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Group } from '../ui2/Group';
import { IconClose } from './icons';
import { refreshNetwork } from '../../lib/refreshNetwork';
import { trpc } from '../../lib/trpc';

/** People the person tapped away, on this device only: the list is a convenience, not a record. */
const HIDDEN_KEY = 'so.suggest.hidden';
const HIDDEN_MAX = 200;

function readHidden(): string[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(HIDDEN_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

function saveHidden(ids: string[]): void {
  try {
    window.localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids.slice(-HIDDEN_MAX)));
  } catch {
    /* private window: hidden for this visit only */
  }
}

/**
 * "You may know each other": people at the 2nd handshake who share two or more acquaintances with the
 * person. "We know each other" sends the usual request, which the other person confirms. Nothing is
 * shown when there is nobody to offer.
 */
export function SuggestList({ names, className }: { names?: Map<string, string>; className?: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  // Kept for the visit: a sent request stays in the list as "Request sent" instead of vanishing under the finger
  const list = trpc.connection.suggestions.useQuery(undefined, { staleTime: Infinity, refetchOnWindowFocus: false });
  const [hidden, setHidden] = useState<string[]>(readHidden);
  const [sent, setSent] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const send = trpc.pending.sendDirectRequest.useMutation({
    onSuccess: (result, input) => {
      setSent((ids) => [...ids, input.targetUserId]);
      void utils.pending.myPending.invalidate();
      // The other person had already asked: the two are connected now
      if ('autoConnected' in result && result.autoConnected) void refreshNetwork(utils);
    },
    onError: (_error, input) => setFailed(input.targetUserId),
    onSettled: () => setBusy(null),
  });

  const people = useMemo(() => (list.data ?? []).filter((p) => !hidden.includes(p.id)), [list.data, hidden]);
  if (people.length === 0) return null;

  const hide = (id: string) => {
    const next = [...hidden.filter((v) => v !== id), id];
    setHidden(next);
    saveHidden(next);
  };

  return (
    <section className={className}>
      <div className="mb-1.5 px-1">
        <h2 className="text-label font-bold text-ink-muted">{t('add.suggest.title')}</h2>
        <p className="mt-0.5 text-caption font-semibold text-ink-muted">{t('add.suggest.hint')}</p>
      </div>
      <Group>
        {people.map((person) => {
          const via = person.via.map((v) => names?.get(v.id) || v.name).join(', ');
          const isSent = sent.includes(person.id);
          return (
            // Two lines: the person and through whom, then the action. On a phone one line has no room
            // for the name next to "We know each other" in the longer languages.
            <div key={person.id} className="px-4 py-2.5">
              <div className="flex items-center gap-2">
                <Link to={`/person/${person.id}`} className="so-focus flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={person.name} src={person.photoUrl} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body font-body text-ink">{person.name}</span>
                    <span className="mt-0.5 block text-label font-semibold text-ink-muted">
                      {t('add.suggest.mutual', { count: person.mutualCount })}
                      {via ? ` · ${via}` : ''}
                    </span>
                  </span>
                </Link>
                {isSent ? null : (
                  <Button
                    variant="icon"
                    className="shrink-0"
                    aria-label={`${t('getApp.dismiss')}: ${person.name}`}
                    onClick={() => hide(person.id)}
                  >
                    <IconClose className="h-[18px] w-[18px]" />
                  </Button>
                )}
              </div>
              <div className="mt-2 ps-[52px]">
                {isSent ? (
                  <p className="text-label font-bold text-ink-muted">{t('person.requestSent')}</p>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    loading={busy === person.id}
                    disabled={busy !== null}
                    onClick={() => {
                      setFailed(null);
                      setBusy(person.id);
                      send.mutate({ targetUserId: person.id, source: 'suggest' });
                    }}
                  >
                    {t('add.know')}
                  </Button>
                )}
                {failed === person.id ? (
                  <p role="alert" className="mt-1.5 text-label font-semibold text-sos">
                    {t('invite.failed')}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </Group>
    </section>
  );
}
