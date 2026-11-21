import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
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
  onEdit?: () => void;
  onShare?: () => void;
  shareBusy?: boolean;
  copied?: boolean;
  failed?: boolean;
  onQr?: () => void;
  onScan?: () => void;
  onNamed?: () => void;
  /** Sheets the card opens (personal invitations). */
  children?: ReactNode;
};

/**
 * The Add screen's link card without data access: LinkCard feeds it (and owns editing and sharing), the landing's
 * "In the app" chapter shows it with an example link.
 */
export function LinkCardView({ slug, shareText, urlFor, editor, onEdit, onShare, shareBusy, copied, failed, onQr, onScan, onNamed, children }: LinkCardViewProps) {
  const { t } = useTranslation();
  const pretty = prettyInvite(slug);
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
          <p className="mt-1 break-all text-title font-extrabold leading-tight text-ink">
            <bdi dir="ltr"><span className="text-ink-muted">{pretty.host}/</span>{pretty.slug}</bdi>
          </p>
          <Button className="mt-3 w-full" icon={<IconShare />} loading={shareBusy} onClick={onShare}>
            {copied ? t('common.copied') : t('add.share')}
          </Button>
          {failed ? <p className="mt-2 text-label font-semibold text-sos">{t('add.shareError')}</p> : null}
          {/* One tap into the messenger most people use; the link says which one it went through */}
          <MessengerButtons className="mt-2.5" text={shareText} urlFor={urlFor} />
          <p className="mt-3 text-caption font-semibold text-ink-muted">{t('add.rules')}</p>
          <div className="mt-3 flex flex-wrap gap-2.5 border-t border-line-soft pt-3">
            <Button className="min-h-11" variant="ghost" size="sm" onClick={onEdit}>{t('add.editLink')}</Button>
            <Button className="min-h-11" variant="ghost" size="sm" onClick={onNamed}>{t('add.named.title')}</Button>
          </div>
          {children}
        </>
      )}
    </Card>
  );
}
