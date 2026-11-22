import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { IconPencil } from '../ui2/icons';
import { IconQr, IconScan, IconShare } from './icons';
import { MessengerButtons } from '../share/MessengerButtons';
import type { Messenger } from '../../lib/messengerShare';
import { prettyInvite } from './links';

type LinkCardViewProps = {
  slug: string;
  /** The text a messenger button sends with the link. */
  shareText: string;
  urlFor: (messenger: Messenger) => string;
  /** While the link is edited the editor takes the card. */
  editor?: ReactNode;
  /** Absent on the landing mock: the address still shows the edit mark, and it does not take focus. */
  onEdit?: () => void;
  onShare?: () => void;
  shareBusy?: boolean;
  copied?: boolean;
  failed?: boolean;
  onQr?: () => void;
  onScan?: () => void;
};

/**
 * The address and its edit live in one row, the same shape as a Need's chat link:
 * the address, then "Change link" in the row, not a button under the card.
 */
function InviteAddress({ slug, onEdit }: { slug: string; onEdit?: () => void }) {
  const { t } = useTranslation();
  const pretty = prettyInvite(slug);
  const className = 'mt-2 flex w-full flex-col items-start gap-1.5 rounded-lg bg-canvas px-3.5 py-3 text-start';
  const inner = (
    <>
      <span className="break-all text-title font-extrabold leading-tight text-ink">
        <bdi dir="ltr"><span className="text-ink-muted">{pretty.host}/</span>{pretty.slug}</bdi>
      </span>
      <span className="inline-flex items-center gap-1.5 text-body-s font-bold text-care">
        <IconPencil className="h-4 w-4" />
        {t('add.editLink')}
      </span>
    </>
  );
  if (!onEdit) return <div className={className}>{inner}</div>;
  return (
    <button type="button" className={`so-focus ${className} hover:bg-surface-2 active:bg-surface-2`} onClick={onEdit}>
      {inner}
    </button>
  );
}

/**
 * The Add screen's link card without data access: LinkCard feeds it (and owns editing and sharing), the landing's
 * "In the app" chapter shows it with an example link.
 */
export function LinkCardView({ slug, shareText, urlFor, editor, onEdit, onShare, shareBusy, copied, failed, onQr, onScan }: LinkCardViewProps) {
  const { t } = useTranslation();
  return (
    <Card className="mt-4">
      {!editor && (
        <div className="mb-4 border-b border-line-soft pb-4">
          <p className="mb-2 text-label font-bold text-ink-muted">{t('add.inPerson')}</p>
          <div className="grid grid-cols-2 gap-2.5">
            <Button className="w-full whitespace-normal" variant="secondary" size="md" icon={<IconQr />} onClick={onQr}>
              {t('add.myQr')}
            </Button>
            <Button className="w-full whitespace-normal" variant="secondary" size="md" icon={<IconScan />} onClick={onScan}>
              {t('add.scan')}
            </Button>
          </div>
        </div>
      )}
      <p className="text-label font-bold text-ink-muted">{t('add.linkLabel')}</p>
      {editor ?? (
        <>
          <InviteAddress slug={slug} onEdit={onEdit} />
          <Button className="mt-3 w-full" icon={<IconShare />} loading={shareBusy} onClick={onShare}>
            {copied ? t('common.copied') : t('add.share')}
          </Button>
          {failed ? <p className="mt-2 text-label font-semibold text-sos">{t('add.shareError')}</p> : null}
          {/* One tap into the messenger most people use; the link says which one it went through */}
          <MessengerButtons className="mt-2.5" text={shareText} urlFor={urlFor} />
          <p className="mt-3 text-caption font-semibold text-ink-muted">{t('add.rules')}</p>
        </>
      )}
    </Card>
  );
}
