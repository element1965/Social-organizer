import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { IconQr, IconScan, IconShare } from './icons';
import { permanentInviteUrl, prettyInvite } from './links';
import { shareLink } from '../../lib/share';

interface LinkCardProps {
  slug: string;
  name: string;
}

export function LinkCard({ slug, name }: LinkCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const pretty = prettyInvite(slug);

  const share = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const outcome = await shareLink({
        title: t('common.appName'),
        text: t('add.shareText', { name }),
        url: permanentInviteUrl(slug),
      });
      if (outcome === 'copied') {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mt-4">
      <p className="text-label font-semibold text-ink-muted">{t('add.linkLabel')}</p>
      <p className="mt-1 break-all text-title font-extrabold leading-tight text-ink">
        <span className="text-ink-muted">{pretty.host}/</span>
        {pretty.slug}
      </p>
      <Button className="mt-4 w-full" icon={<IconShare />} loading={busy} onClick={() => void share()}>
        {copied ? t('common.copied') : t('add.share')}
      </Button>
      {failed ? <p className="mt-2 text-label font-semibold text-sos">{t('add.shareError')}</p> : null}
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        <Button className="w-full" variant="secondary" icon={<IconQr />} onClick={() => navigate('/add/qr')}>
          {t('add.myQr')}
        </Button>
        <Button className="w-full" variant="secondary" icon={<IconScan />} onClick={() => navigate('/add/scan')}>
          {t('add.scan')}
        </Button>
      </div>
      <p className="mt-3 text-caption font-semibold text-ink-muted">{t('add.rules')}</p>
    </Card>
  );
}
