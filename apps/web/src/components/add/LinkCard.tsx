import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { isValidReferralSlug } from '@so/shared';
import { Button } from '../ui2/Button';
import { Input } from '../ui2/Input';
import { LinkCardView } from './LinkCardView';
import { NamedInvites } from './NamedInvites';
import { withSrc } from '../../lib/messengerShare';
import { permanentInviteUrl, prettyInvite } from './links';
import { shareLink } from '../../lib/share';
import { trpc } from '../../lib/trpc';
import { errorCode } from '../../lib/errors';

interface LinkCardProps {
  slug: string;
  name: string;
}

export function LinkCard({ slug, name }: LinkCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const utils = trpc.useUtils();
  const updateSlug = trpc.user.updateReferralSlug.useMutation({ meta: { notifyOnError: false } });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [editError, setEditError] = useState('');
  const [namedOpen, setNamedOpen] = useState(false);
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
    setDraft(slug);
    setEditError('');
    setEditing(true);
  };

  const save = async () => {
    const next = draft.trim().toLowerCase();
    if (next === slug) {
      setEditing(false);
      return;
    }
    if (!isValidReferralSlug(next)) {
      setEditError(t('account.slugInvalid'));
      return;
    }
    try {
      const updated = await updateSlug.mutateAsync({ slug: next });
      await utils.user.inviteSlug.cancel();
      utils.user.inviteSlug.setData(undefined, updated);
      await utils.user.me.invalidate();
      setEditing(false);
    } catch (error) {
      setEditError(errorCode(error) === 'CONFLICT' ? t('account.slugTaken') : t('common.error'));
    }
  };

  const editor = editing ? (
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
  ) : undefined;

  return (
    <LinkCardView
      slug={slug}
      shareText={t('add.shareText', { name })}
      urlFor={(messenger) => withSrc(permanentInviteUrl(slug), messenger)}
      editor={editor}
      onEdit={startEdit}
      onShare={() => void share()}
      shareBusy={busy}
      copied={copied}
      failed={failed}
      onQr={() => navigate('/add/qr')}
      onScan={() => navigate('/add/scan')}
      onNamed={() => setNamedOpen(true)}
    >
      <NamedInvites open={namedOpen} onClose={() => setNamedOpen(false)} slug={slug} name={name} />
    </LinkCardView>
  );
}
