import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { useOffline } from '../../lib/connectivity';
import { OfflineHint } from '../offline/OfflineNotice';
import { Button } from '../ui2/Button';
import { Input } from '../ui2/Input';
import { Sheet } from '../ui2/Sheet';

export type AcquaintRequest = { pendingId: string; personId: string; name: string };

type Props = {
  request: AcquaintRequest | null;
  onClose: () => void;
};

/** Server error codes from connection-request.service mapped to a clear next step. */
export function errorKey(code: string | undefined): string {
  switch (code) {
    case 'CONNECTION_LIMIT_SELF':
      return 'add.limitSelf';
    case 'CONNECTION_LIMIT_OTHER':
      return 'add.limitOther';
    case 'REQUESTER_DELETED':
      return 'circle.acquaint.errGone';
    case 'REQUEST_ALREADY_RESOLVED':
      return 'circle.acquaint.errResolved';
    default:
      return 'common.error';
  }
}

/**
 * "We know each other" / "We don't": accept or reject an incoming request. After accepting,
 * the same sheet offers the circle label prefilled with the account name.
 */
export function AcquaintSheet({ request, onClose }: Props) {
  const { t } = useTranslation();
  const offline = useOffline();
  const utils = trpc.useUtils();
  const [step, setStep] = useState<'ask' | 'label'>('ask');
  const [label, setLabel] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!request) return;
    setStep('ask');
    setLabel(request.name);
    setError(null);
  }, [request]);

  const refresh = () => {
    void utils.pending.incoming.invalidate();
    void utils.pending.incomingCount.invalidate();
    void utils.connection.list.invalidate();
    void utils.connection.graphSlice.invalidate();
    void utils.connection.getNetworkStats.invalidate();
    void utils.stats.networkCapabilities.invalidate();
    void utils.milestone.list.invalidate();
    void utils.collection.askAccess.invalidate();
  };

  const accept = trpc.pending.accept.useMutation({
    onMutate: () => setError(null),
    onSuccess: () => {
      refresh();
      setStep('label');
    },
    onError: (err) => {
      setError(t(errorKey(err.message)));
      refresh();
    },
  });
  const reject = trpc.pending.reject.useMutation({
    onMutate: () => setError(null),
    onSuccess: () => {
      refresh();
      onClose();
    },
    onError: (err) => {
      setError(t(errorKey(err.message)));
      refresh();
    },
  });
  const nickname = trpc.connection.setNickname.useMutation({
    onSuccess: () => {
      void utils.connection.list.invalidate();
      onClose();
    },
    onError: () => setError(t('common.error')),
  });

  const finish = () => {
    if (!request) return;
    const value = label.trim();
    if (!value || value === request.name) {
      onClose();
      return;
    }
    nickname.mutate({ targetUserId: request.personId, nickname: value });
  };

  if (!request) return null;

  if (step === 'label') {
    return (
      <Sheet
        open
        onClose={finish}
        title={request.name}
        description={t('circle.acquaint.connected')}
        footer={
          <Button onClick={finish} loading={nickname.isPending}>
            {t('common.done')}
          </Button>
        }
      >
        <Input
          label={t('person.nickname')}
          hint={t('person.nicknameHint')}
          value={label}
          maxLength={100}
          onChange={(event) => setLabel(event.target.value)}
          error={error ?? undefined}
        />
      </Sheet>
    );
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={request.name}
      description={t('circle.acquaint.sub')}
      footer={
        <>
          <Button onClick={() => accept.mutate({ pendingId: request.pendingId })} loading={accept.isPending} disabled={reject.isPending || offline}>
            {t('circle.acquaint.yes')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => reject.mutate({ pendingId: request.pendingId })}
            loading={reject.isPending}
            disabled={accept.isPending || offline}
          >
            {t('circle.acquaint.no')}
          </Button>
        </>
      }
    >
      {error ? (
        <p role="alert" className="text-label font-semibold text-sos">
          {error}
        </p>
      ) : (
        <p className="text-caption text-ink-muted">{t('circle.acquaint.meetHint')}</p>
      )}
      {offline ? <OfflineHint className="mt-2 text-label font-semibold text-ink-muted" /> : null}
    </Sheet>
  );
}
