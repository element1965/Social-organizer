import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { Button } from '../ui2/Button';
import { Row } from '../ui2/Group';
import { Sheet } from '../ui2/Sheet';
import { moderationError } from './errors';

/** Open circle reviews inside the admin group. Admins can close any of them by hand. */
export function AdminReviews() {
  const { t } = useTranslation();
  const utils = trpc.useUtils();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const list = trpc.moderation.adminOpenReviews.useQuery(undefined, { retry: false });
  const closeReview = trpc.moderation.adminClose.useMutation({
    onSuccess: async () => {
      setPendingId(null);
      await Promise.all([
        utils.moderation.adminOpenReviews.invalidate(),
        utils.collection.getById.invalidate(),
      ]);
    },
    onError: () => setPendingId(null),
  });

  if (!list.data) return null;
  const rows = list.data;

  return (
    <>
      <Row
        title={t('moderation.adminOpen')}
        variant="link"
        value={rows.length > 0 ? String(rows.length) : undefined}
        subtitle={rows.length === 0 ? t('moderation.adminEmpty') : undefined}
        onClick={() => setOpen(true)}
      />
      <Sheet open={open} onClose={() => setOpen(false)} title={t('moderation.adminOpen')}>
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          {rows.length === 0 ? <p className="text-body-s font-semibold text-ink-muted">{t('moderation.adminEmpty')}</p> : null}
          {rows.map((row) => (
            <div key={row.id} className="rounded-lg bg-canvas px-3 py-3">
              <p className="truncate text-body font-bold text-ink">{row.authorName}</p>
              <p className="mt-1 text-label font-semibold text-ink-muted">
                {row.kind === 'ESCALATION'
                  ? t('moderation.adminEscalation')
                  : t('moderation.adminMeta', {
                      complaints: row.complaintCount,
                      votes: row.voteCount,
                      audience: row.audienceCount,
                    })}
              </p>
              {row.reasons.length > 0 ? (
                <ul className="mt-1.5 flex flex-col gap-1">
                  {row.reasons.map((item) => (
                    <li key={item.reason} className="text-label font-semibold text-ink">
                      {t(`moderation.reasons.${item.reason}`)}
                      {' · '}
                      {item.count}
                    </li>
                  ))}
                </ul>
              ) : null}
              <Link to={`/collection/${row.collectionId}`} className="so-focus mt-2 inline-flex text-body-s font-bold text-care" onClick={() => setOpen(false)}>
                {t('moderation.openCollection')}
              </Link>
              <div className="mt-3 flex flex-col gap-2">
                <Button
                  variant="danger"
                  loading={pendingId === row.id && closeReview.isPending && closeReview.variables?.outcome === 'UPHELD'}
                  disabled={closeReview.isPending}
                  onClick={() => {
                    setPendingId(row.id);
                    closeReview.mutate({ reviewId: row.id, outcome: 'UPHELD' });
                  }}
                >
                  {t('moderation.uphold')}
                </Button>
                <Button
                  variant="secondary"
                  loading={pendingId === row.id && closeReview.isPending && closeReview.variables?.outcome === 'DISMISSED'}
                  disabled={closeReview.isPending}
                  onClick={() => {
                    setPendingId(row.id);
                    closeReview.mutate({ reviewId: row.id, outcome: 'DISMISSED' });
                  }}
                >
                  {t('moderation.dismiss')}
                </Button>
              </div>
            </div>
          ))}
          {closeReview.isError ? <p className="text-label font-semibold text-sos">{moderationError(closeReview.error, t)}</p> : null}
        </div>
      </Sheet>
    </>
  );
}
