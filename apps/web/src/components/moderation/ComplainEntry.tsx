import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { Button } from '../ui2/Button';
import { Group, Row } from '../ui2/Group';
import { Sheet } from '../ui2/Sheet';
import { moderationError } from './errors';

const REASONS = ['COMPLAINTS', 'SUSPECTED_FRAUD', 'RULES_VIOLATION', 'ACCOUNT_HACKED'] as const;
type ComplaintReason = (typeof REASONS)[number];

const choiceClass = (selected: boolean) => cn(
  'so-focus min-h-row w-full whitespace-normal rounded-lg px-4 py-3 text-left text-body-s font-bold',
  selected ? 'bg-ink text-canvas' : 'border border-line bg-canvas text-ink',
);

export function ComplainSheet({
  open,
  onClose,
  pending = false,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  pending?: boolean;
  error?: string | null;
  onSubmit?: (input: { reason: ComplaintReason; comment: string }) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<ComplaintReason | null>(null);
  const [comment, setComment] = useState('');

  useEffect(() => {
    if (!open) return;
    setReason(null);
    setComment('');
  }, [open]);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('moderation.complainTitle')}
      description={t('moderation.complainBody')}
      footer={(
        <Button
          className="col-span-2 w-full"
          loading={pending}
          disabled={reason == null}
          onClick={() => {
            if (!reason) return;
            onSubmit?.({ reason, comment });
          }}
        >
          {t('moderation.submit')}
        </Button>
      )}
    >
      <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto">
        {REASONS.map((item) => (
          <button
            key={item}
            type="button"
            aria-pressed={reason === item}
            className={choiceClass(reason === item)}
            onClick={() => setReason(item)}
          >
            {t(`moderation.reasons.${item}`)}
          </button>
        ))}
        <label className="mt-2 block">
          <span className="mb-1.5 block text-label font-semibold text-ink-muted">{t('moderation.comment')}</span>
          <textarea
            value={comment}
            maxLength={280}
            rows={3}
            onChange={(event) => setComment(event.target.value)}
            className="w-full resize-none rounded-lg border border-line bg-surface-2 px-3.5 py-3 text-body-s font-semibold text-ink outline-none placeholder:text-ink-subtle focus:border-care"
          />
          <span className="mt-1.5 block text-label font-semibold text-ink-muted">
            {t('moderation.commentHint')}
            {' '}
            {comment.length}/280
          </span>
        </label>
        {error ? <p className="text-label font-semibold text-sos">{error}</p> : null}
      </div>
    </Sheet>
  );
}

/** Bottom row on a collection. Hidden unless the server says this person may report. */
export function ComplainEntry({ collectionId }: { collectionId: string }) {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const gate = trpc.moderation.canComplain.useQuery(
    { collectionId },
    { enabled: collectionId.length > 0, retry: false, refetchOnWindowFocus: false },
  );
  const complain = trpc.moderation.complain.useMutation({
    onSuccess: async () => {
      setOpen(false);
      await Promise.all([
        utils.moderation.canComplain.invalidate({ collectionId }),
        utils.moderation.myOpenReviews.invalidate(),
      ]);
    },
  });

  if (!gate.data || !('allowed' in gate.data) || gate.data.allowed !== true) return null;

  return (
    <>
      <Group className="mt-4">
        <Row
          title={t('moderation.complain')}
          variant="danger"
          onClick={() => {
            complain.reset();
            setOpen(true);
          }}
        />
      </Group>
      <ComplainSheet
        open={open}
        onClose={() => setOpen(false)}
        pending={complain.isPending}
        error={complain.isError ? moderationError(complain.error, t) : null}
        onSubmit={(input) => complain.mutate({ collectionId, reason: input.reason, comment: input.comment || undefined })}
      />
    </>
  );
}
