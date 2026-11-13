import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isTelegramWebApp } from '@so/tg-adapter';
import { saveContacts } from '@so/gun-backup';
import { refreshNetwork } from '../lib/refreshNetwork';
import { trpc } from '../lib/trpc';
import { toSavedContacts } from '../lib/savedCopy';
import { useAuth } from '../hooks/useAuth';
import { useNicknames } from '../hooks/useNicknames';
import { Avatar } from '../components/ui2/Avatar';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Group, Row } from '../components/ui2/Group';
import { Input } from '../components/ui2/Input';
import { Screen } from '../components/ui2/Screen';
import { PathChain } from '../components/person/PathChain';
import { contactHref } from '../components/person/contactHref';
import { Sheet } from '../components/ui2/Sheet';
import { AdminPersonPanel } from '../components/admin/AdminPersonPanel';
import { formatMoney } from '../components/ui2/format';
import { SocialIcon } from '../components/ui/social-icons';
import { isLive } from '../components/profile/collections';
import { ONLINE_MS } from '../components/profile/constants';
import { relativeTime } from '../components/profile/dates';
import { trpcCode } from '../components/profile/errors';
import { instagramHandle, isMobileUa } from '../components/profile/openExternal';
import { QueryState } from '../components/profile/QueryState';
import { useSmartBack } from '../components/profile/useSmartBack';

type Ask = { id: string; type: string; amount: number | null; status: string };

export function PersonPage() {
  const { id = '' } = useParams();
  return <PersonScreen key={id} />;
}

function PersonScreen() {
  const { id = '' } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const back = useSmartBack(t('common.back'), '/');
  const utils = trpc.useUtils();
  const resolve = useNicknames();

  const me = trpc.user.me.useQuery();
  const admin = trpc.faq.isAdmin.useQuery();
  const isAdmin = admin.data?.isAdmin === true;
  const isSelf = me.data?.id === id;
  const other = !!id && me.isSuccess && !isSelf;
  const user = trpc.user.getById.useQuery({ userId: id }, { enabled: other });
  const pathQuery = trpc.connection.findPath.useQuery({ targetUserId: id }, { enabled: other });
  const nick = trpc.connection.getNickname.useQuery({ targetUserId: id }, { enabled: other });
  const contacts = trpc.user.getContacts.useQuery({ userId: id }, { enabled: other });
  const participating = trpc.collection.myParticipating.useQuery(undefined, { enabled: other });
  const notes = trpc.notification.list.useQuery({ limit: 100 }, { enabled: other });
  const facts = trpc.stats.participationFacts.useQuery({ userId: id }, { enabled: other && !!id });
  const history = trpc.stats.helpHistory.useQuery(
    { userId: me.data?.id ?? '' },
    { enabled: other && !!me.data?.id },
  );

  const path = pathQuery.data?.path ?? [];
  const depth = path.length > 0 ? path.length - 1 : 0;
  const ring1 = path.length === 2;
  const deeper = path.length >= 3;
  const outside = pathQuery.isSuccess && path.length === 0;

  const outgoing = trpc.pending.myPending.useQuery(undefined, { enabled: deeper });
  const direct = trpc.pending.directStatus.useQuery({ targetUserId: id }, { enabled: deeper });
  const setNickname = trpc.connection.setNickname.useMutation({
    onSuccess: () => {
      void utils.connection.getNickname.invalidate({ targetUserId: id });
      void utils.connection.list.invalidate();
    },
  });
  const sendRequest = trpc.pending.sendDirectRequest.useMutation({
    onSuccess: (result) => {
      void utils.pending.myPending.invalidate();
      void utils.pending.directStatus.invalidate({ targetUserId: id });
      if ('autoConnected' in result && result.autoConnected) {
        void utils.connection.findPath.invalidate({ targetUserId: id });
        void utils.connection.getNickname.invalidate({ targetUserId: id });
        void utils.connection.list.invalidate();
      }
    },
  });
  const cancelRequest = trpc.pending.cancel.useMutation({
    onSuccess: () => {
      // Forget the local "sent" result too, otherwise the page keeps showing the request
      sendRequest.reset();
      void utils.pending.myPending.invalidate();
      void utils.pending.directStatus.invalidate({ targetUserId: id });
    },
  });
  const revoke = trpc.connection.revoke.useMutation({
    onSuccess: () => {
      void refreshNetwork(utils);
      navigate('/');
    },
  });

  // Keep the contacts of a direct connection for the offline copy: exactly what the server just showed this viewer
  const myId = useAuth((s) => s.userId);
  const savedPhone = user.data?.phone;
  const savedContacts = contacts.data;
  useEffect(() => {
    if (!myId || !ring1 || !user.isSuccess || !contacts.isSuccess) return;
    void saveContacts(myId, id, toSavedContacts(savedPhone, savedContacts ?? [])).catch(() => undefined);
  }, [myId, ring1, id, user.isSuccess, contacts.isSuccess, savedPhone, savedContacts]);

  const [draft, setDraft] = useState<string | null>(null);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = useState(false);
  const draftRef = useRef('');
  const savedRef = useRef<string | null>(null);
  const ringRef = useRef(false);
  const mutateRef = useRef(setNickname.mutate);
  mutateRef.current = setNickname.mutate;
  ringRef.current = ring1;
  const serverNick = (nick.data?.nickname ?? '').trim();
  const shown = draft ?? nick.data?.nickname ?? '';
  draftRef.current = shown;
  if (savedRef.current === null && nick.data) savedRef.current = serverNick;

  useEffect(() => {
    const userId = id;
    return () => {
      if (!ringRef.current || !userId || savedRef.current === null) return;
      const next = draftRef.current.trim();
      if (next === savedRef.current) return;
      savedRef.current = next;
      mutateRef.current({ targetUserId: userId, nickname: next });
    };
  }, [id]);

  const commitNick = () => {
    if (!ring1) return;
    const next = shown.trim();
    if (next === (savedRef.current ?? serverNick)) return;
    savedRef.current = next;
    setNickname.mutate({ targetUserId: id, nickname: next });
  };

  if (!id) {
    return (
      <Screen back={back} width="column">
        <p className="py-8 text-center text-body font-semibold text-ink">{t('common.notFound')}</p>
      </Screen>
    );
  }
  if (isSelf) return <Navigate to="/me" replace />;

  const loading = me.isLoading || user.isLoading || pathQuery.isLoading;
  const missing = trpcCode(user.error) === 'NOT_FOUND';
  if (loading || user.isError || pathQuery.isError || !user.data) {
    return (
      <Screen back={back} width="column">
        {missing ? (
          <p className="py-8 text-center text-body font-semibold text-ink">{t('common.notFound')}</p>
        ) : (
          <QueryState
            isLoading={loading && !user.isError && !pathQuery.isError}
            isError={user.isError || pathQuery.isError}
            onRetry={() => {
              void user.refetch();
              void pathQuery.refetch();
            }}
          />
        )}
      </Screen>
    );
  }

  const person = user.data;
  const deleted = person.name === 'Deleted user';
  const accountName = deleted ? t('person.deleted') : person.name;
  const nickname = ring1 ? shown.trim() : '';
  const display = nickname || accountName;
  const online = !!person.lastSeen && Date.now() - new Date(person.lastSeen).getTime() < ONLINE_MS;
  const viaNode = path.length > 2 ? path[path.length - 2] : undefined;
  // Beyond my visible rings the server does not say who it is
  const viaName = viaNode && !viaNode.hidden ? resolve(viaNode.id, viaNode.name) : '';
  const ring = depth === 1
    ? t('circle.rings.full1')
    : depth === 2
      ? t('circle.rings.full2')
      : depth === 3
        ? t('circle.rings.full3')
        : depth > 3
          ? t('person.ringN', { n: depth })
          : '';
  const ringLine = [ring, viaName ? t('person.via', { name: viaName }) : ''].filter(Boolean).join(' · ');

  const asks = new Map<string, Ask>();
  for (const row of participating.data ?? []) {
    if (row.collection.creator.id !== id || row.unsubscribedAt || !isLive(row.collection.status)) continue;
    asks.set(row.collection.id, {
      id: row.collection.id,
      type: row.collection.type,
      amount: row.collection.amount,
      status: row.collection.status,
    });
  }
  for (const note of notes.data?.items ?? []) {
    const collection = note.collection;
    if (!collection || collection.creator.id !== id || !isLive(collection.status) || asks.has(collection.id)) continue;
    asks.set(collection.id, {
      id: collection.id,
      type: collection.type,
      amount: collection.amount,
      status: collection.status,
    });
  }
  const activeAsks = [...asks.values()];

  const joined = (participating.data ?? []).filter((row) => row.collection.creator.id === id);
  const joinedIds = new Set(joined.map((row) => row.id));
  const helpedYou = (history.data?.helpedBy ?? []).filter((row) => row.userId === id && !joinedIds.has(row.id));
  // My request was declined: the person is not asked again (SO-45); meeting in person still connects
  const declined =
    sendRequest.error?.message === 'Request declined' || (direct.data?.status === 'rejected' && direct.data.mine);
  const requestSent =
    !declined &&
    ((outgoing.data ?? []).some((row) => row.toUser.id === id) ||
      (sendRequest.isSuccess && !('autoConnected' in sendRequest.data && sendRequest.data.autoConnected)) ||
      trpcCode(sendRequest.error) === 'CONFLICT');

  // After a withdrawal a new request waits out a cooldown on the server (against send/withdraw loops)
  const retryIso = direct.data?.retryAt ?? (cancelRequest.isSuccess ? cancelRequest.data.retryAt : null);
  const retryAt = retryIso && new Date(retryIso).getTime() > Date.now() ? new Date(retryIso) : null;
  const coolingDown = !requestSent && (!!retryAt || trpcCode(sendRequest.error) === 'TOO_MANY_REQUESTS');
  const retryText = retryAt
    ? new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(retryAt)
    : '';

  const contactItems = [
    ...(person.phone ? [{ type: 'phone', value: person.phone, label: t('profile.phone') }] : []),
    ...(contacts.data ?? [])
      .filter((contact) => contact.value.trim())
      .map((contact) => ({ type: contact.type, value: contact.value, label: contact.label || t(`contacts.${contact.type}`) })),
  ];
  const visibleContacts = contactsOpen ? contactItems : contactItems.slice(0, 2);
  const hiddenCount = contactItems.length - visibleContacts.length;

  const openContact = (event: React.MouseEvent<HTMLAnchorElement>, type: string, value: string) => {
    const href = contactHref(type, value);
    if (!href) {
      event.preventDefault();
      return;
    }
    if (type === 'instagram' && isMobileUa()) {
      event.preventDefault();
      const handle = instagramHandle(value);
      void navigator.clipboard.writeText(handle).then(() => {
        setCopied(type);
        window.setTimeout(() => setCopied((current) => (current === type ? null : current)), 2000);
      }).catch(() => {
        setCopied(null);
      });
      return;
    }
    if (isTelegramWebApp() && !href.startsWith('mailto:') && !href.startsWith('tel:')) {
      event.preventDefault();
      window.Telegram?.WebApp?.openLink?.(href, { try_instant_view: false });
    }
  };

  return (
    <Screen back={back} width="column">
      {path.length > 1 ? <PathChain nodes={path} targetLabel={display} /> : null}
      <div className={path.length > 1 ? 'mt-4 flex items-center gap-4' : 'mt-2 flex items-center gap-4'}>
        <Avatar name={display} src={person.photoUrl} size={88} online={online} />
        <div className="min-w-0">
          <h2 className="truncate text-title font-bold text-ink">{display}</h2>
          {ringLine ? <p className="mt-0.5 text-label font-semibold text-ink-muted">{ringLine}</p> : null}
          {outside ? <p className="mt-0.5 text-label font-semibold text-ink-muted">{t('person.notInCircle')}</p> : null}
          {online ? (
            <p className="mt-1 text-label font-bold text-care">{t('profile.online')}</p>
          ) : person.lastSeen ? (
            <p className="mt-1 text-label font-semibold text-ink-muted">
              {t('profile.lastSeen', { time: relativeTime(person.lastSeen, i18n.language) })}
            </p>
          ) : null}
          {nickname && nickname !== accountName ? (
            <p className="mt-1 text-label font-semibold text-ink-muted">{t('person.accountName', { name: accountName })}</p>
          ) : null}
        </div>
      </div>

      {ring1 ? (
        <div className="mt-5">
          <Input
            label={t('person.nickname')}
            hint={t('person.nicknameHint')}
            value={shown}
            maxLength={100}
            placeholder={t('profile.nicknamePlaceholder')}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commitNick}
          />
        </div>
      ) : null}

      {/* Contacts have their own list below with a button per contact, so no separate Contacts button here */}
      {activeAsks[0] ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" size="md" onClick={() => navigate(`/collection/${activeAsks[0]!.id}`)}>
            {t('person.openCollection')}
          </Button>
        </div>
      ) : null}

      {activeAsks.map((ask) => (
        <Card
          key={ask.id}
          className="mt-4"
          title={ask.type === 'REGULAR' ? t('profile.every28') : t('profile.once')}
          subtitle={ask.amount ? formatMoney(ask.amount) : t('profile.goalMissing')}
        >
          <Button variant="secondary" size="md" onClick={() => navigate(`/collection/${ask.id}`)}>
            {t('person.openCollection')}
          </Button>
          {ask.status === 'BLOCKED' ? <p className="mt-2 text-label font-semibold text-ink-muted">{t('profile.paused')}</p> : null}
        </Card>
      ))}

      {deeper ? (
        <div className="mt-5">
          {declined ? (
            <p className="rounded-lg bg-surface px-4 py-3 text-body-s font-semibold text-ink-muted shadow-card">
              {t('person.requestDeclined')}
            </p>
          ) : requestSent ? (
            <div className="flex items-center gap-3 rounded-lg bg-care-soft py-1 pl-4 pr-1">
              <p className="min-w-0 flex-1 py-2 text-body-s font-bold text-care">{t('person.requestSent')}</p>
              <Button
                variant="text"
                className="min-h-[44px] px-3"
                loading={cancelRequest.isPending}
                onClick={() => cancelRequest.mutate({ targetUserId: id })}
              >
                {t('person.withdrawRequest')}
              </Button>
            </div>
          ) : coolingDown ? (
            <p className="rounded-lg bg-surface px-4 py-3 text-body-s font-semibold text-ink-muted shadow-card">
              {retryText ? t('person.requestCooldown', { when: retryText }) : t('person.requestCooldownSoon')}
            </p>
          ) : (
            <>
              <Button className="w-full" loading={sendRequest.isPending} onClick={() => sendRequest.mutate({ targetUserId: id })}>
                {t('person.acquainted')}
              </Button>
              <p className="mt-2 text-label font-semibold text-ink-muted">{t('person.acquaintedHint')}</p>
            </>
          )}
        </div>
      ) : null}

      <section id="person-contacts" className="mt-6">
        <h2 className="mb-2 px-1 text-label font-bold text-ink-muted">{t('person.contacts')}</h2>
        {!contacts.isSuccess ? null : contactItems.length === 0 ? (
          <p className="px-1 text-body-s font-semibold text-ink-muted">
            {ring1 ? t('person.noContacts') : t('person.contactsHidden')}
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visibleContacts.map((contact) => {
              const href = contactHref(contact.type, contact.value);
              if (!href) return null;
              const label = copied === contact.type ? t('common.copied') : contact.label;
              return (
                <a
                  key={contact.type}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(event) => openContact(event, contact.type, contact.value)}
                  className="so-focus inline-flex h-[26px] items-center gap-1.5 rounded-sm bg-surface-2 px-2.5 text-micro font-bold text-ink"
                >
                  <SocialIcon type={contact.type === 'phone' ? 'phone' : contact.type} className="h-4 w-4" />
                  {label}
                </a>
              );
            })}
            {hiddenCount > 0 ? (
              <button
                type="button"
                className="so-focus inline-flex h-[26px] items-center rounded-sm bg-surface-2 px-2.5 text-micro font-bold text-ink-muted"
                onClick={() => setContactsOpen(true)}
              >
                {t('person.moreContacts', { count: hiddenCount })}
              </button>
            ) : null}
          </div>
        )}
      </section>

      {facts.data && facts.data.reported > 0 ? (
        <Group title={t('person.factsTitle')}>
          <Row title={t('person.factsReported')} value={String(facts.data.reported)} variant="value" chevron={false} />
          <Row title={t('person.factsMarked')} value={String(facts.data.marked)} variant="value" chevron={false} />
        </Group>
      ) : null}
      {facts.data && facts.data.reported > 0 ? (
        <p className="mt-2 px-1 text-label font-semibold text-ink-muted">{t('person.factsNote')}</p>
      ) : null}

      {joined.length > 0 || helpedYou.length > 0 ? (
        <Group title={t('person.shared')}>
          {joined.map((row) => (
            <Row
              key={row.id}
              title={row.collection.type === 'REGULAR' ? t('profile.every28') : t('profile.once')}
              subtitle={formatMoney(row.amount)}
              to={`/collection/${row.collection.id}`}
              variant="link"
            />
          ))}
          {helpedYou.map((row) => (
            <Row key={row.id} title={t('person.helpedYou')} subtitle={formatMoney(row.amount)} />
          ))}
        </Group>
      ) : participating.isSuccess && activeAsks.length === 0 ? (
        <p className="mt-6 px-1 text-body-s font-semibold text-ink-muted">{t('person.noShared')}</p>
      ) : null}

      {isAdmin && !deleted ? (
        <AdminPersonPanel userId={id} createdAt={person.createdAt} remainingBudget={person.remainingBudget} />
      ) : null}

      {ring1 ? (
        <Button variant="textDanger" className="mt-8" onClick={() => setRemoveOpen(true)}>
          {t('person.remove')}
        </Button>
      ) : null}

      <Sheet
        open={removeOpen}
        onClose={() => setRemoveOpen(false)}
        title={t('person.removeTitle', { name: display })}
        description={t('person.removeBody')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoveOpen(false)}>{t('person.keep')}</Button>
            <Button variant="danger" loading={revoke.isPending} onClick={() => revoke.mutate({ targetUserId: id })}>
              {t('person.removeConfirm')}
            </Button>
          </>
        }
      />
      {revoke.isError ? <p className="mt-2 text-label font-semibold text-sos">{t('common.error')}</p> : null}
    </Screen>
  );
}
