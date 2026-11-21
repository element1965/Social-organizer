import type { ReactNode } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Avatar } from '../ui2/Avatar';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { formatMoney } from '../ui2/format';
import { Meter } from '../ui2/Meter';
import { PathFigure } from '../ui2/PathFigure';
import { StageRail } from '../ui2/StageRail';
import { IconChat } from './icons';

/**
 * The cards of the Need page without data access: the page (CollectionPage) feeds them from the API, the landing's
 * "In the app" chapter from its example. Both draw the same thing.
 */

type NeedSummaryCardProps = {
  /** Names from me to the author ("You", …, the author). Not shown with fewer than two. */
  pathNames?: string[];
  askAcquaintance?: { id: string; name: string };
  creatorName: string;
  /** Use the author's name as the page heading when the screen header has no title. */
  pageHeading?: boolean;
  photoUrl?: string | null;
  /** Opens the author's page; without it the name is plain text. */
  onCreator?: () => void;
  /** "Emergency · opened 2 hours ago" */
  subtitle: string;
  /** The amount reported so far against the amount needed; null when the Need names no amount. */
  meter: { mine: number; others: number; goal: number; showMine: boolean } | null;
  stages: string[];
  stageDone: number;
  /** A line under the stage rail (who closes the Need). */
  note?: string | null;
};

/** The head of a Need: the chain to the author, the author, the amount reported and the stage. */
export function NeedSummaryCard({ pathNames, askAcquaintance, creatorName, pageHeading, photoUrl, onCreator, subtitle, meter, stages, stageDone, note }: NeedSummaryCardProps) {
  const { t } = useTranslation();
  const AuthorLine = pageHeading ? 'h1' : 'div';
  return (
    <Card className="mt-2">
      {pathNames && pathNames.length > 1 ? (
        <div className="mb-4">
          <PathFigure names={pathNames} />
          {askAcquaintance ? (
            <Link
              to={`/person/${encodeURIComponent(askAcquaintance.id)}`}
              className="so-focus inline-flex min-h-11 min-w-11 max-w-full items-center rounded-md text-body-s font-bold text-ink-muted underline underline-offset-2 hover:text-ink"
            >
              <span className="min-w-0 break-words">
                <Trans
                  i18nKey="collection.askAcquaintance"
                  values={{ name: askAcquaintance.name }}
                  components={{ name: <bdi /> }}
                  tOptions={{ interpolation: { escapeValue: true } }}
                  shouldUnescape
                />
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Avatar name={creatorName} src={photoUrl ?? null} size={48} />
        <div className="min-w-0">
          <AuthorLine className="text-title font-extrabold">
            {onCreator ? (
              <button type="button" className="so-focus block max-w-full truncate" onClick={onCreator}>
                {creatorName}
              </button>
            ) : (
              <span className="block truncate">{creatorName}</span>
            )}
          </AuthorLine>
          <p className="mt-0.5 text-label font-semibold text-ink-muted">{subtitle}</p>
        </div>
      </div>
      {meter ? (
        <Meter mine={meter.mine} others={meter.others} goal={meter.goal} showMine={meter.showMine} />
      ) : (
        <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.noGoal')}</p>
      )}
      <StageRail steps={stages} done={stageDone} />
      {note ? <p className="mt-3 text-label font-semibold text-ink-muted">{note}</p> : null}
    </Card>
  );
}

type MyParticipationCardProps = {
  amount: number;
  /** While the amount is edited the editor takes the card: one main action at a time. */
  editor?: ReactNode;
  onChange?: () => void;
  /** Opens the participants' chat; without it the button is not shown. */
  onOpenChat?: () => void;
  /** Secondary action under the money note. */
  footer?: ReactNode;
};

/** My Participation in someone's Need: the amount, the way to the chat and what the app does not do with money. */
export function MyParticipationCard({ amount, editor, onChange, onOpenChat, footer }: MyParticipationCardProps) {
  const { t } = useTranslation();
  return (
    <Card className="mt-3">
      {editor ?? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <b className="block text-h3 font-extrabold tabular-nums"><bdi dir="ltr">{formatMoney(amount)}</bdi></b>
            <span className="text-label font-semibold text-ink-muted">{t('collection.youParticipate')}</span>
          </div>
          <Button variant="secondary" size="md" onClick={onChange}>
            {t('collection.change')}
          </Button>
        </div>
      )}
      {/* Hidden while the amount is edited: one main action at a time */}
      {!editor && onOpenChat ? (
        <Button className="mt-4 w-full" icon={<IconChat />} onClick={onOpenChat}>
          {t('collection.openCollectionChat')}
        </Button>
      ) : null}
      <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.moneyNote')}</p>
      {footer}
    </Card>
  );
}
