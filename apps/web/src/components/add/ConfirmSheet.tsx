import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Sheet } from '../ui2/Sheet';
import { refreshNetwork } from '../../lib/refreshNetwork';
import { announceJoin, sliceSize } from '../circle/joining';
import { errorKey } from '../circle/AcquaintSheet';
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
  const [error, setError] = useState<string | null>(null);
  const accept = trpc.pending.accept.useMutation();
  const reject = trpc.pending.reject.useMutation();
  const busy = accept.isPending || reject.isPending;

  const refresh = async () => {
    await refreshNetwork(utils);
  };

  const run = async (kind: 'accept' | 'reject') => {
    if (!person) return;
    setError(null);
    try {
      const before = sliceSize(utils);
      if (kind === 'accept') await accept.mutateAsync({ pendingId: person.pendingId });
      else await reject.mutateAsync({ pendingId: person.pendingId });
      await refresh();
      // The newest connection is the person just confirmed
      if (kind === 'accept') void announceJoin(utils, undefined, before);
      onClose();
    } catch (err) {
      // Say what happened (limit, gone, answered elsewhere) and show the list as it is now
      setError(errorKey((err as { message?: string })?.message));
      void refresh();
    }
  };

  return (
    <Sheet
      open={person != null}
      onClose={onClose}
      title={person?.name ?? ''}
      description={person ? t('add.confirmBody', { name: givenName(person.name) }) : undefined}
    >
      {error ? <p className="text-label font-semibold text-sos">{t(error === 'common.error' ? 'add.confirmError' : error)}</p> : null}
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
