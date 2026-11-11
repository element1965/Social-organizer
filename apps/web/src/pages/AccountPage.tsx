import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CONTACT_TYPES, contactValueAllowed, type ContactType } from '@so/shared';
import { isTelegramWebApp } from '@so/tg-adapter';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
import { useConnectTelegram } from '../hooks/useConnectTelegram';
import { Button } from '../components/ui2/Button';
import { Group, Row } from '../components/ui2/Group';
import { Input } from '../components/ui2/Input';
import { Screen } from '../components/ui2/Screen';
import { Sheet } from '../components/ui2/Sheet';
import { DeleteAccountSheet } from '../components/onboarding/AccountSheets';
import { Avatar } from '../components/ui2/Avatar';
import { QueryState } from '../components/profile/QueryState';
import { ACCOUNT_NOTICE_KEY, publicHost } from '../components/profile/constants';
import { trpcCode } from '../components/profile/errors';
import { useSmartBack } from '../components/profile/useSmartBack';

const FIXED_TYPES = new Set(['email', 'telegram']);

type ExtraContact = { type: ContactType; value: string };
type ContactInput = { type: ContactType; value: string };

function isContactType(value: string): value is ContactType {
  return CONTACT_TYPES.some((item) => item.type === value);
}

function splitName(name: string): [string, string] {
  const trimmed = name.trim();
  const index = trimmed.indexOf(' ');
  if (index === -1) return [trimmed, ''];
  return [trimmed.slice(0, index), trimmed.slice(index + 1).trim()];
}

function phoneOk(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const digits = trimmed.replace(/\D/g, '');
  return trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15;
}

function slugOk(value: string, original: string): boolean {
  const next = value.trim().toLowerCase();
  if (next === original) return true;
  if (!next && !original) return true;
  return /^[a-zA-Z0-9_-]{3,30}$/.test(next);
}

export function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const back = useSmartBack(t('common.back'), '/me');
  const utils = trpc.useUtils();
  const logout = useAuth((state) => state.logout);
  const fileRef = useRef<HTMLInputElement>(null);

  const me = trpc.user.me.useQuery();
  const settings = trpc.settings.get.useQuery();
  const contacts = trpc.user.getContacts.useQuery({});
  const updateUser = trpc.user.update.useMutation();
  const updateSlug = trpc.user.updateReferralSlug.useMutation();
  const updateContacts = trpc.user.updateContacts.useMutation();
  const updateHide = trpc.settings.updateHideContacts.useMutation({
    onSuccess: () => utils.settings.get.invalidate(),
  });
  const deleteAccount = trpc.user.delete.useMutation();
  const { connect, isPending: connectPending } = useConnectTelegram();

  const [ready, setReady] = useState(false);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [telegramLocked, setTelegramLocked] = useState(false);
  const [slug, setSlug] = useState('');
  const [extras, setExtras] = useState<ExtraContact[]>([]);
  const [nameError, setNameError] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [slugError, setSlugError] = useState('');
  const [contactErrors, setContactErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [pickOpen, setPickOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  const [photoError, setPhotoError] = useState('');

  const initialContacts = useRef<Map<string, string>>(new Map());
  const leaveSaved = useRef(false);
  const flushRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (ready || !me.data || !contacts.data) return;
    const [given, family] = splitName(me.data.name);
    setFirst(given);
    setLast(family);
    setPhone(me.data.phone ?? '');
    setSlug(me.data.referralSlug ?? '');
    const map = new Map<string, string>();
    const extra: ExtraContact[] = [];
    for (const contact of contacts.data) {
      map.set(contact.type, contact.value);
      if (contact.type === 'telegram') {
        setTelegram(contact.value);
        setTelegramLocked('locked' in contact && Boolean((contact as { locked?: boolean }).locked));
      } else if (isContactType(contact.type) && contact.value.trim() && !FIXED_TYPES.has(contact.type)) {
        extra.push({ type: contact.type, value: contact.value });
      }
    }
    initialContacts.current = map;
    setExtras(extra);
    setReady(true);
  }, [contacts.data, me.data, ready]);

  const profile = me.data;
  const originalSlug = (profile?.referralSlug ?? '').toLowerCase();

  const validate = (report: boolean): ContactInput[] | null => {
    const nextName = [first.trim(), last.trim()].filter(Boolean).join(' ');
    let ok = true;
    if (!nextName) {
      ok = false;
      if (report) setNameError(t('account.nameRequired'));
    } else if (report) setNameError('');
    if (!phoneOk(phone)) {
      ok = false;
      if (report) setPhoneError(t('account.phoneInvalid'));
    } else if (report) setPhoneError('');
    if (!slugOk(slug, originalSlug)) {
      ok = false;
      if (report) setSlugError(t('account.slugInvalid'));
    } else if (report) setSlugError('');

    const payload: ContactInput[] = [{ type: 'telegram', value: telegram.trim() }];
    for (const extra of extras) payload.push({ type: extra.type, value: extra.value.trim() });
    for (const [type, value] of initialContacts.current) {
      if (!isContactType(type) || FIXED_TYPES.has(type)) continue;
      if (!extras.some((extra) => extra.type === type) && value.trim()) payload.push({ type, value: '' });
    }
    const errors: Record<string, string> = {};
    for (const item of payload) {
      if (item.type === 'telegram' && telegramLocked) continue;
      if (!contactValueAllowed(item.type, item.value)) {
        ok = false;
        errors[item.type] = t('validation.invalidContact');
      }
    }
    if (report) setContactErrors(errors);
    if (!ok) return null;
    return payload;
  };

  const noteDropped = () => {
    try {
      sessionStorage.setItem(ACCOUNT_NOTICE_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };

  const persist = async (report: boolean): Promise<boolean> => {
    if (!profile) return false;
    if (report) {
      const payload = validate(true);
      if (!payload) return false;
      const nextName = [first.trim(), last.trim()].filter(Boolean).join(' ');
      const nextPhone = phone.trim();
      const nextSlug = slug.trim().toLowerCase();
      setFormError('');
      try {
        if (nextName !== profile.name || nextPhone !== (profile.phone ?? '')) {
          await updateUser.mutateAsync({ name: nextName, phone: nextPhone });
        }
        if (nextSlug && nextSlug !== originalSlug) {
          await updateSlug.mutateAsync({ slug: nextSlug });
        }
        const changed = payload.some((item) => (initialContacts.current.get(item.type) ?? '') !== item.value);
        if (changed) await updateContacts.mutateAsync(payload);
        await Promise.all([
          utils.user.me.invalidate(),
          utils.user.getContacts.invalidate(),
        ]);
        return true;
      } catch (error) {
        if (trpcCode(error) === 'CONFLICT') setSlugError(t('account.slugTaken'));
        else setFormError(t('common.error'));
        return false;
      }
    }

    const [given, family] = splitName(profile.name);
    const nextName = [first.trim(), last.trim()].filter(Boolean).join(' ');
    const nextPhone = phone.trim();
    const nextSlug = slug.trim().toLowerCase();
    let dropped = false;
    const userPatch: { name?: string; phone?: string } = {};
    if (!nextName) {
      if (first.trim() !== given || last.trim() !== family) dropped = true;
    } else if (nextName !== profile.name) {
      userPatch.name = nextName;
    }
    if (!phoneOk(phone)) {
      if (nextPhone !== (profile.phone ?? '')) dropped = true;
    } else if (nextPhone !== (profile.phone ?? '')) {
      userPatch.phone = nextPhone;
    }
    let slugToSave: string | null = null;
    if (!slugOk(slug, originalSlug)) dropped = true;
    else if (nextSlug && nextSlug !== originalSlug) slugToSave = nextSlug;

    const payload: ContactInput[] = [];
    if (!telegramLocked) {
      const value = telegram.trim();
      const previous = initialContacts.current.get('telegram') ?? '';
      if (!contactValueAllowed('telegram', value)) {
        if (value !== previous) dropped = true;
      } else if (value !== previous) {
        payload.push({ type: 'telegram', value });
      }
    }
    for (const extra of extras) {
      const value = extra.value.trim();
      const previous = initialContacts.current.get(extra.type) ?? '';
      if (!contactValueAllowed(extra.type, value)) {
        if (value !== previous) dropped = true;
        continue;
      }
      if (value !== previous) payload.push({ type: extra.type, value });
    }
    for (const [type, value] of initialContacts.current) {
      if (!isContactType(type) || FIXED_TYPES.has(type)) continue;
      if (!extras.some((extra) => extra.type === type) && value.trim()) payload.push({ type, value: '' });
    }
    if (dropped) noteDropped();
    if (!userPatch.name && userPatch.phone === undefined && !slugToSave && payload.length === 0) return !dropped;
    try {
      if (userPatch.name || userPatch.phone !== undefined) await updateUser.mutateAsync(userPatch);
      if (slugToSave) await updateSlug.mutateAsync({ slug: slugToSave });
      if (payload.length) await updateContacts.mutateAsync(payload);
      await Promise.all([
        utils.user.me.invalidate(),
        utils.user.getContacts.invalidate(),
      ]);
      return !dropped;
    } catch {
      return false;
    }
  };

  flushRef.current = () => {
    if (!ready || leaveSaved.current) return;
    void persist(false);
  };

  useEffect(() => () => flushRef.current(), []);

  const done = async () => {
    const ok = await persist(true);
    if (!ok) return;
    leaveSaved.current = true;
    const idx = (window.history.state as { idx?: number } | null)?.idx;
    if (typeof idx === 'number' && idx > 0) navigate(-1);
    else navigate('/me');
  };

  const onFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setPhotoError(t('account.photoInvalid'));
    };
    img.onload = () => {
      URL.revokeObjectURL(url);
      setPhotoError('');
      const canvas = document.createElement('canvas');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      updateUser.mutate(
        { photoUrl: canvas.toDataURL('image/jpeg', 0.8) },
        { onSuccess: () => utils.user.me.invalidate() },
      );
    };
    img.src = url;
  };

  const available = CONTACT_TYPES.filter(
    (contact) => !FIXED_TYPES.has(contact.type) && !extras.some((extra) => extra.type === contact.type),
  );
  const telegramLinked = profile?.platformAccounts.some((account) => account.platform === 'TELEGRAM') ?? false;
  const saving = updateUser.isPending || updateSlug.isPending || updateContacts.isPending;

  const failed = me.isError || settings.isError || contacts.isError;
  if (failed || !ready || !profile || !settings.data) {
    return (
      <Screen title={t('nav.account')} back={back} width="column">
        <QueryState
          isLoading={!failed}
          isError={failed}
          onRetry={() => {
            void me.refetch();
            void settings.refetch();
            void contacts.refetch();
          }}
        />
      </Screen>
    );
  }

  return (
    <Screen
      title={t('nav.account')}
      back={back}
      width="column"
      action={
        <Button variant="text" onClick={() => void done()} loading={saving}>
          {t('common.done')}
        </Button>
      }
    >
      <div className="mt-2 flex items-center gap-4">
        <button type="button" className="so-focus relative rounded-2xl" onClick={() => fileRef.current?.click()}>
          <Avatar name={profile.name} src={profile.photoUrl} size={88} />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-care text-care-on">
            <CameraIcon />
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="sr-only"
          aria-label={t('account.changePhoto')}
          onChange={onFile}
        />
        <p className="text-body-s font-semibold text-ink-muted">{t('account.changePhoto')}</p>
      </div>
      {photoError ? <p className="mt-2 text-label font-semibold text-sos">{photoError}</p> : null}

      <div className="mt-5 space-y-4">
        <Input
          label={t('account.firstName')}
          value={first}
          autoComplete="given-name"
          onChange={(event) => setFirst(event.target.value)}
          error={nameError || undefined}
        />
        <Input
          label={t('account.lastName')}
          value={last}
          autoComplete="family-name"
          onChange={(event) => setLast(event.target.value)}
        />
        <Input
          label={t('account.phone')}
          value={phone}
          autoComplete="tel"
          inputMode="tel"
          onChange={(event) => setPhone(event.target.value)}
          error={phoneError || undefined}
        />
        <Input label={t('account.email')} variant="locked" value={profile.email || t('account.notSet')} hint={t('account.loginHint')} />
        {telegramLocked ? (
          <Input label={t('account.telegram')} variant="locked" value={telegram || t('account.notSet')} />
        ) : (
          <Input
            label={t('account.telegram')}
            value={telegram}
            hint={t('account.telegramHint')}
            onChange={(event) => setTelegram(event.target.value)}
            error={contactErrors.telegram}
          />
        )}
        <Input
          label={t('account.yourLink')}
          value={slug}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          hint={t('account.linkHint', { host: `${publicHost()}/i` })}
          onChange={(event) => setSlug(event.target.value)}
          error={slugError || undefined}
        />
        {extras.map((extra) => (
          <div key={extra.type}>
            <Input
              label={t(`contacts.${extra.type}`)}
              value={extra.value}
              onChange={(event) => {
                const value = event.target.value;
                setExtras((list) => list.map((item) => (item.type === extra.type ? { ...item, value } : item)));
              }}
              error={contactErrors[extra.type]}
            />
            <Button
              variant="textDanger"
              className="mt-1"
              onClick={() => setExtras((list) => list.filter((item) => item.type !== extra.type))}
            >
              {t('account.removeContact')}
            </Button>
          </div>
        ))}
        {available.length > 0 ? (
          <Button variant="secondary" size="md" onClick={() => setPickOpen(true)}>
            {t('account.moreContact')}
          </Button>
        ) : null}
        {formError ? <p className="text-label font-semibold text-sos">{formError}</p> : null}
      </div>

      <Group title={t('settings.contacts')}>
        <div>
          <Row
            title={t('settings.hideContacts')}
            variant="toggle"
            checked={settings.data.hideContacts}
            onCheckedChange={(hideContacts) => updateHide.mutate({ hideContacts })}
          />
          <p className="px-4 pb-3 text-label font-semibold text-ink-muted">{t('settings.hideContactsHint')}</p>
        </div>
      </Group>

      {telegramLinked ? (
        <p className="mt-4 px-1 text-label font-semibold text-ink-muted">{t('settings.telegramConnected')}</p>
      ) : isTelegramWebApp() ? null : (
        <div className="mt-4">
          <Button variant="secondary" size="md" onClick={connect} loading={connectPending}>
            {t('settings.connectTelegram')}
          </Button>
          <p className="mt-2 px-1 text-label font-semibold text-ink-muted">{t('settings.connectTelegramHint')}</p>
        </div>
      )}

      <div className="mt-8">
        <Button variant="textDanger" onClick={() => setDeleteOpen(true)}>
          {t('settings.deleteAccount')}
        </Button>
      </div>

      <Sheet open={pickOpen} onClose={() => setPickOpen(false)} title={t('account.pickContact')}>
        <div className="max-h-[60vh] overflow-y-auto">
          {available.map((contact) => (
            <button
              key={contact.type}
              type="button"
              className="so-focus flex min-h-row w-full items-center rounded-md px-2 text-left text-body font-semibold text-ink"
              onClick={() => {
                setExtras((list) => [...list, { type: contact.type, value: '' }]);
                setPickOpen(false);
              }}
            >
              {t(`contacts.${contact.type}`)}
            </button>
          ))}
        </div>
      </Sheet>

      <DeleteAccountSheet
        open={deleteOpen}
        selfId={profile.id}
        pending={deleteAccount.isPending}
        failed={deleteError}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteError(false);
        }}
        onConfirm={() => {
          setDeleteError(false);
          deleteAccount.mutate(undefined, {
            onSuccess: () => {
              leaveSaved.current = true;
              logout();
              // №24: say what happened instead of a silent jump to the sign-in screen
              // A full load: logout() would otherwise let the shell gate send this route to the landing first
              window.location.replace('/login?deleted=1');
            },
            onError: () => setDeleteError(true),
          });
        }}
      />
    </Screen>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M4 8h3l2-2h6l2 2h3v11H4V8z" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}
