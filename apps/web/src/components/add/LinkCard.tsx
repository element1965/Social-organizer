import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui2/Button';
import { Card } from '../ui2/Card';
import { Input } from '../ui2/Input';
import { IconQr, IconScan, IconShare } from './icons';
import { permanentInviteUrl, prettyInvite } from './links';
import { shareLink } from '../../lib/share';
import { trpc } from '../../lib/trpc';

interface LinkCardProps {
  slug: string;
  name: string;
  /** The id the person chose; empty while the link still carries the internal user id */
  customSlug?: string | null;
}

const SLUG_RE = /^[a-z0-9_-]{3,30}$/;

function errorCode(error: unknown): string | undefined {
  return (error as { data?: { code?: string } } | null)?.data?.code;
}

export function LinkCard({ slug, name, customSlug }: LinkCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const updateSlug = trpc.user.updateReferralSlug.useMutation();
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState('');
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

  const startEdit = () => {
    // Without a chosen id the link carries the internal one: start from an empty field instead
    setDraft(customSlug ?? '');
    setEditError('');
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim().toLowerCase();
    if (next === (customSlug ?? '')) {
      setEditing(false);
      return;
    }
    if (!SLUG_RE.test(next)) {
      setEditError(t('account.slugInvalid'));
      return;
    }
    try {
      await updateSlug.mutateAsync({ slug: next });
      await utils.user.me.invalidate();
      setEditing(false);
    } catch (error) {
      setEditError(errorCode(error) === 'CONFLICT' ? t('account.slugTaken') : t('common.error'));
    }
  };

  return (
    <Card className="mt-4">
      <p className="text-label font-semibold text-ink-muted">{t('add.linkLabel')}</p>
      {editing ? (
        <form
          className="mt-2"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <Input
            aria-label={t('add.linkLabel')}
            value={draft}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={30}
            placeholder={t('add.linkPlaceholder')}
            hint={`${pretty.host}/${draft.trim().toLowerCase() || '…'} · ${t('add.linkEditHint')}`}
            error={editError || undefined}
            onChange={(event) => {
              setDraft(event.target.value);
              if (editError) setEditError('');
            }}
          />
          <div className="mt-3 grid grid-cols-2 gap-2.5">
            <Button type="button" className="w-full" variant="secondary" onClick={() => setEditing(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" className="w-full" loading={updateSlug.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </form>
      ) : (
        <>
          <p className="mt-1 break-all text-title font-extrabold leading-tight text-ink">
            <span className="text-ink-muted">{pretty.host}/</span>
            {pretty.slug}
          </p>
          <Button className="mt-1 -ml-2" variant="text" onClick={startEdit}>
            {t('add.editLink')}
          </Button>
          <Button className="mt-3 w-full" icon={<IconShare />} loading={busy} onClick={() => void share()}>
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
        </>
      )}
    </Card>
  );
}
