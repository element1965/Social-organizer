import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { cn } from '../../lib/utils';
import { inflectName } from '../collection/name-case';
import { firstName } from '../collection/text';
import { EventRow } from '../ui2/EventRow';
import { Sheet } from '../ui2/Sheet';
import { moderationError } from './errors';

const ANSWERS = ['PROBLEM', 'OK', 'UNKNOWN'] as const;
type VoteAnswer = (typeof ANSWERS)[number];

type ReasonCount = { reason: string; count: number };

export type ReviewSheetData = {
  id: string;
  collectionId: string;
  authorName: string;
  reasons: ReasonCount[];
  myVote: VoteAnswer | null;
};

function circleName(fullName: string, language: string): string {
  if (language.toLowerCase().startsWith('ru')) return inflectName(fullName, 'genitive');
  return firstName(fullName);
}

function IconFlag() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-5 w-5">
      <path d="M5 21V4" />
      <path d="M5 4h10l-1.5 3.5L15 11H5" />
    </svg>
  );
}

const choiceClass = (selected: boolean) => cn(
  'so-focus min-h-row w-full whitespace-normal rounded-lg px-4 py-3 text-left text-body-s font-bold disabled:opacity-[0.45]',
  selected ? 'bg-ink text-canvas' : 'border border-line bg-canvas text-ink',
);

export function ReviewSheet({
  open,
  onClose,
  review,
  pending = false,
  error,
  onVote,
}: {
  open: boolean;
  onClose: () => void;
  review: ReviewSheetData | null;
  pending?: boolean;
  error?: string | null;
  onVote?: (answer: VoteAnswer) => void;
}) {
  const { t, i18n } = useTranslation();
  const name = review ? circleName(review.authorName, i18n.language) : '';
  const voted = review?.myVote != null;

  return (
    <Sheet
      open={open && review != null}
      onClose={onClose}
      title={t('moderation.questionTitle', { name })}
      description={t('moderation.questionBody')}
    >
      {review ? (
        <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
          <div>
            <p className="text-label font-bold text-ink-muted">{t('moderation.reasonsHeading')}</p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {review.reasons.map((item) => (
                <li key={item.reason} className="text-body-s font-semibold text-ink">
                  {t(`moderation.reasons.${item.reason}`)}
                  {' · '}
                  {item.count}
                </li>
              ))}
            </ul>
          </div>
          <Link to={`/collection/${review.collectionId}`} className="so-focus self-start text-body-s font-bold text-care" onClick={onClose}>
            {t('moderation.openCollection')}
          </Link>
          <div className="flex flex-col gap-2">
            {ANSWERS.map((answer) => (
              <button
                key={answer}
                type="button"
                aria-pressed={review.myVote === answer}
                disabled={pending || voted}
                className={choiceClass(review.myVote === answer)}
                onClick={() => onVote?.(answer)}
              >
                {t(`moderation.vote.${answer}`)}
              </button>
            ))}
          </div>
          {voted ? <p className="text-label font-semibold text-ink-muted">{t('moderation.voted')}</p> : null}
          {error ? <p className="text-label font-semibold text-sos">{error}</p> : null}
        </div>
      ) : null}
    </Sheet>
  );
}

function isVote(value: string | null | undefined): value is VoteAnswer {
  return value === 'PROBLEM' || value === 'OK' || value === 'UNKNOWN';
}

/** Feed rows for circle questions addressed to the signed-in person. Renders nothing when there are none. */
export function ReviewFeedRows() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const utils = trpc.useUtils();
  const reviews = trpc.moderation.myOpenReviews.useQuery(undefined, {
    retry: false,
    refetchInterval: 20_000,
  });
  const vote = trpc.moderation.vote.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.moderation.myOpenReviews.invalidate(),
        utils.collection.myParticipating.invalidate(),
        utils.collection.myActive.invalidate(),
      ]);
    },
  });

  const [manualId, setManualId] = useState<string | null>(null);
  const [closedId, setClosedId] = useState<string | null>(null);
  const rows = (reviews.data ?? []).map((row) => ({
    id: row.id,
    collectionId: row.collectionId,
    authorName: row.authorName,
    reasons: row.reasons,
    myVote: isVote(row.myVote) ? row.myVote : null,
  }));

  const requested = params.get('review');
  const activeId = manualId ?? (requested && requested !== closedId ? requested : null);
  const active = rows.find((row) => row.id === activeId) ?? null;

  const close = () => {
    if (activeId) setClosedId(activeId);
    setManualId(null);
    if (params.get('review')) {
      const next = new URLSearchParams(params);
      next.delete('review');
      setParams(next, { replace: true });
    }
  };

  if (rows.length === 0 && !active) return null;

  return (
    <>
      {rows.length > 0 ? (
        <ul className="mb-2 flex flex-col gap-2">
          {rows.map((row) => {
            const name = circleName(row.authorName, i18n.language);
            return (
              <li key={row.id}>
                <EventRow
                  icon={<IconFlag />}
                  title={t('moderation.feedTitle', { name })}
                  subtitle={row.myVote ? t('moderation.voted') : t('moderation.feedSubtitle')}
                  hot={row.myVote == null}
                  onClick={() => {
                    vote.reset();
                    setClosedId(null);
                    setManualId(row.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
      <ReviewSheet
        open={active != null}
        onClose={close}
        review={active}
        pending={vote.isPending}
        error={vote.isError ? moderationError(vote.error, t) : null}
        onVote={(answer) => {
          if (!active || active.myVote) return;
          vote.mutate({ reviewId: active.id, answer });
        }}
      />
    </>
  );
}
