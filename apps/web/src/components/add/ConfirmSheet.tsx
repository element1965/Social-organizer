import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { trpc } from '../../lib/trpc';

interface ConfirmPerson {
  pendingId: string;
  name: string;
}

interface ConfirmSheetProps {
  person: ConfirmPerson | null;
  onClose: () => void;
}

function givenName(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

export function ConfirmSheet({ person, onClose }: ConfirmSheetProps) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [error, setError] = useState(false);
  const accept = trpc.pending.accept.useMutation();
  const reject = trpc.pending.reject.useMutation();
  const busy = accept.isPending || reject.isPending;

  const refresh = async () => {
    await Promise.all([
      utils.pending.incoming.invalidate(),
      utils.connection.list.invalidate(),
      utils.collection.askAccess.invalidate(),
    ]);
  };

  const run = async (kind: 'accept' | 'reject') => {
    if (!person) return;
    setError(false);
    try {
      if (kind === 'accept') await accept.mutateAsync({ pendingId: person.pendingId });
      else await reject.mutateAsync({ pendingId: person.pendingId });
      await refresh();
      onClose();
    } catch {
      setError(true);
    }
  };

  return (
    <Sheet
      open={person != null}
      onClose={onClose}
      title={person?.name ?? ''}
      description={person ? t('add.confirmBody', { name: givenName(person.name) }) : undefined}
    >
      {error ? <p className="text-label font-semibold text-sos">{t('add.confirmError')}</p> : null}
      <div className="mt-4 flex flex-col-reverse gap-2.5 min-[1024px]:flex-row">
        <Button className="w-full" variant="secondary" disabled={busy} loading={reject.isPending} onClick={() => void run('reject')}>
          {t('add.dontKnow')}
        </Button>
        <Button className="w-full" disabled={busy} loading={accept.isPending} onClick={() => void run('accept')}>
          {t('add.know')}
        </Button>
      </div>
    </Sheet>
  );
}
