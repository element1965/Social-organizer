import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Input } from '../ui2/Input';
import { Sheet } from '../ui2/Sheet';
import { trpc } from '../../lib/trpc';
import { IconCheck } from './icons';

export interface ScanResultPerson {
  userId: string;
  name: string;
  photoUrl?: string | null;
  pending: boolean;
  already: boolean;
  /** True when this connection is the viewer's first. */
  first: boolean;
  nickname: string;
}

interface ResultSheetProps {
  person: ScanResultPerson | null;
  onClose: () => void;
}

function givenName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function ResultSheet({ person, onClose }: ResultSheetProps) {
  const { t } = useTranslation();
  const [nickname, setNickname] = useState(person?.nickname ?? '');
  const [error, setError] = useState(false);
  const setName = trpc.connection.setNickname.useMutation();
  const personId = person?.userId;
  const initial = person?.nickname ?? '';

  // Reset the field when a new person is scanned. Adjusting state during render
  // is the supported way to keep a form in step with a changing identity.
  const [seen, setSeen] = useState(personId);
  if (personId !== seen) {
    setSeen(personId);
    setNickname(initial);
    setError(false);
  }

  const subtitle = !person
    ? ''
    : person.pending
      ? t('add.resultPending', { name: person.name })
      : person.already
        ? t('add.resultAlready')
        : person.first
          ? t('add.resultHandshake')
          : t('add.resultJoined');

  const done = async () => {
    if (!person) return;
    if (!person.pending && nickname.trim() !== initial.trim()) {
      try {
        await setName.mutateAsync({ targetUserId: person.userId, nickname: nickname.trim() });
      } catch {
        setError(true);
        return;
      }
    }
    onClose();
  };

  return (
    <Sheet
      open={person != null}
      onClose={onClose}
      title={person?.name ?? ''}
      description={subtitle}
      leading={
        person ? (
          <span className="relative block">
            <Avatar name={person.name} src={person.photoUrl} size={48} />
            {person.pending ? null : (
              <span className="absolute -bottom-1 -right-1 grid h-[22px] w-[22px] place-items-center rounded-full bg-care text-care-on ring-[3px] ring-surface">
                <IconCheck className="h-3 w-3" />
              </span>
            )}
          </span>
        ) : null
      }
      meta={
        person && !person.pending ? (
          <span className="text-micro font-bold text-care">{t('add.resultConfirmed')}</span>
        ) : null
      }
    >
      {person ? (
        <>
          {person.pending ? null : (
            <div className="mt-1">
              <Input
                label={t('person.nickname')}
                hint={t('add.nicknameHint', { name: givenName(person.name) })}
                value={nickname}
                onChange={(event) => setNickname(event.target.value)}
                maxLength={100}
              />
            </div>
          )}
          {error ? <p className="mt-2 text-label font-semibold text-sos">{t('add.confirmError')}</p> : null}
          <Button className="mt-4 w-full" loading={setName.isPending} onClick={() => void done()}>
            {t('common.done')}
          </Button>
        </>
      ) : null}
    </Sheet>
  );
}
