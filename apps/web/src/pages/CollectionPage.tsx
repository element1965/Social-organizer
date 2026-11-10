import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MIN_COLLECTION_AMOUNT, MIN_OBLIGATION_AMOUNT, REGULAR_CYCLE_DAYS } from '@so/shared';
import { IconChat, IconClock, IconPen, IconQr, IconShare } from '../components/collection/icons';
import { PreviousCycles } from '../components/collection/PreviousCycles';
import { ParticipantList, type ParticipantRow } from '../components/collection/ParticipantList';
import { MarkableParticipantList } from '../components/collection/PaidMarks';
import { QrSheet } from '../components/collection/QrSheet';
import { CommunityHoldNote } from '../components/moderation/CommunityHoldNote';
import { ComplainEntry } from '../components/moderation/ComplainEntry';
import { amountIssue, asDate, firstName, formatDay, isHttpsUrl, parseWhole, relativePast, shortUrl } from '../components/collection/text';
import { Avatar } from '../components/ui2/Avatar';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { formatMoney } from '../components/ui2/format';
import { Input } from '../components/ui2/Input';
import { Meter } from '../components/ui2/Meter';
import { PathFigure } from '../components/ui2/PathFigure';
import { Screen } from '../components/ui2/Screen';
import { Sheet } from '../components/ui2/Sheet';
import { Textarea } from '../components/ui2/Textarea';
import { StageRail } from '../components/ui2/StageRail';
import { useShellMode } from '../components/ui2/shell-mode';
import { useAuth } from '../hooks/useAuth';
import { useNicknames } from '../hooks/useNicknames';
import { buildSosInviteUrl } from '../lib/inviteUrl';
import { trpc } from '../lib/trpc';
import { useOffline } from '../lib/connectivity';
import { isPendingRequest, useDeclineNeed, useExpiryTick, type NotificationItem } from '../hooks/useEvents';
import { OfflineHint } from '../components/offline/OfflineNotice';

const DESCRIPTION_MAX = 300;

const REASONS = ['COMPLAINTS', 'SUSPECTED_FRAUD', 'RULES_VIOLATION', 'AUTHOR_REQUEST'] as const;
type BlockReason = (typeof REASONS)[number];

function isReason(value: string | null | undefined): value is BlockReason {
  return REASONS.some((reason) => reason === value);
}

/**
 * Desktop dialog is a two-column grid, so the first child sits on the left (the destructive one).
 * A phone sheet stacks, so the quiet action stays on top and the destructive one follows.
 */
function sheetPair(desktop: boolean, action: ReactNode, dismiss: ReactNode, destructive: boolean) {
  if (!desktop && destructive) {
    return (
      <>
        {dismiss}
        {action}
      </>
    );
  }
  return (
    <>
      {action}
      {dismiss}
    </>
  );
}

export function CollectionPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isSos = searchParams.get('sos') === 'true';
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const desktop = useShellMode() === 'sidebar';
  const offline = useOffline();
  const userId = useAuth((state) => state.userId);
  const resolve = useNicknames();
  const utils = trpc.useUtils();
  const startedSos = useRef(false);

  const me = trpc.user.me.useQuery();
  const admin = trpc.faq.isAdmin.useQuery();
  const connections = trpc.connection.list.useQuery();
  const collection = trpc.collection.getById.useQuery({ id: id ?? '' }, { enabled: !!id, refetchInterval: 30_000 });
  // The request notice of this Need: while it waits for my decision the graph on the Circle shows its impulse
  const notices = trpc.notification.list.useQuery({ limit: 100 });
  const declineNeed = useDeclineNeed();
  const noticeItems = notices.data?.items as unknown as NotificationItem[] | undefined;
  useExpiryTick(noticeItems, id);
  const path = trpc.connection.findPath.useQuery(
    { targetUserId: collection.data?.creatorId ?? '' },
    { enabled: !!collection.data && collection.data.creatorId !== userId },
  );

  const refresh = () => {
    if (!id) return;
    utils.collection.getById.invalidate({ id });
    utils.collection.myActive.invalidate();
    // All, not only mounted queries: the Circle is not mounted here, and must not show a stale impulse on return
    utils.collection.myParticipating.invalidate(undefined, { refetchType: 'all' });
  };

  const createObligation = trpc.obligation.create.useMutation({ onSuccess: refresh });
  const updateObligation = trpc.obligation.updateAmount.useMutation({ onSuccess: refresh });
  const confirmCycle = trpc.obligation.confirmCycle.useMutation({ onSuccess: refresh });
  // Withdrawing a Participation is a decision too: the request notice must not bring the impulse back
  const decline = trpc.obligation.unsubscribeFromCollection.useMutation({
    onSuccess: (_row, vars) => {
      refresh();
      void declineNeed(vars.collectionId);
    },
  });
  const closeCollection = trpc.collection.close.useMutation({ onSuccess: refresh });
  const updateChat = trpc.collection.updateChatLink.useMutation({ onSuccess: refresh });
  const updateDescription = trpc.collection.updateDescription.useMutation({ onSuccess: refresh });
  const updateGoal = trpc.collection.updateAmount.useMutation({ onSuccess: refresh });
  const removeJoiner = trpc.collection.removeJoiner.useMutation({
    onSuccess: () => {
      refresh();
      utils.connection.list.invalidate();
    },
  });
  const block = trpc.collection.block.useMutation({ onSuccess: refresh });
  const unblock = trpc.collection.unblock.useMutation({ onSuccess: refresh });
  const acceptSos = trpc.invite.acceptSos.useMutation({ onSuccess: refresh });
  const setBudget = trpc.user.setMonthlyBudget.useMutation();

  useEffect(() => {
    const data = collection.data;
    if (startedSos.current || !isSos || !data || !userId || data.creatorId === userId) return;
    startedSos.current = true;
    acceptSos.mutate({ collectionId: data.id });
  }, [isSos, collection.data, userId, acceptSos]);

  const [joinAmount, setJoinAmount] = useState('');
  const [seeded, setSeeded] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editAmount, setEditAmount] = useState('');
  const [editError, setEditError] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [declineOpen, setDeclineOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chatEditing, setChatEditing] = useState(false);
  const [chatValue, setChatValue] = useState('');
  const [chatError, setChatError] = useState('');
  const [descEditing, setDescEditing] = useState(false);
  const [descValue, setDescValue] = useState('');
  const [descError, setDescError] = useState('');
  const [goalAmount, setGoalAmount] = useState('');
  const [goalError, setGoalError] = useState('');
  const [removeTarget, setRemoveTarget] = useState<ParticipantRow | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const [reason, setReason] = useState<BlockReason | null>(null);
  const openAssistant = () => navigate('/me/help/assistant');

  useEffect(() => {
    if (seeded || !me.data) return;
    const stake = Math.max(MIN_OBLIGATION_AMOUNT, Math.round(me.data.monthlyBudget || MIN_OBLIGATION_AMOUNT));
    setJoinAmount(String(stake));
    setSeeded(true);
  }, [me.data, seeded]);

  const direct = useMemo(() => new Set((connections.data ?? []).map((person) => person.userId)), [connections.data]);

  if (!id || collection.isLoading) {
    return (
      <Screen width="column" back={{ label: t('nav.circle'), to: '/' }}>
        <p className="pt-6 text-body-s font-semibold text-ink-muted">{t('common.loading')}</p>
      </Screen>
    );
  }
  if (collection.isError || !collection.data) {
    return (
      <Screen width="column" back={{ label: t('nav.circle'), to: '/' }}>
        <Card className="mt-4">
          <p>{t('common.notFound')}</p>
          <Button className="mt-3 w-full" onClick={() => collection.refetch()}>{t('common.retry')}</Button>
        </Card>
      </Screen>
    );
  }

  const data = collection.data;
  const owner = data.creatorId === userId;
  // The server list already drops unsubscribed rows. Filter here too so an older API does not put them back.
  const activeObligations = data.obligations.filter((row) => row.unsubscribedAt == null);
  const myObl = activeObligations.find((row) => row.userId === userId);
  const communityHold = data.blockReason === 'COMMUNITY';
  const adminHold = data.status === 'BLOCKED' && isReason(data.blockReason);
  const held = adminHold || communityHold;
  const goalMet = data.status === 'BLOCKED' && !data.blockReason;
  const closed = data.status === 'CLOSED' || data.status === 'CANCELLED';
  const hasGoal = data.amount != null && data.amount > 0;
  const renewal = data.type === 'REGULAR' && data.cycleNumber > 1 && data.currentCycleStart != null;
  const needsConfirm = !!myObl && renewal && myObl.cycleConfirmed === false && !held && !closed && data.status === 'ACTIVE';
  const showDecline = !owner && !!myObl && !closed && !held;
  // Asked to help, not yet in, and the notice is still open: "Not now" ends the impulse on the Circle
  const pendingIds = (noticeItems ?? [])
    .filter((n) => n.collectionId === data.id && isPendingRequest(n, Date.now()))
    .map((n) => n.id);
  const waitsForMe = !owner && !myObl && data.status === 'ACTIVE' && !held && pendingIds.length > 0;
  const showAdmin = admin.data?.isAdmin === true && !closed && (data.status === 'ACTIVE' || held);
  const language = i18n.language;
  const creatorName = resolve(data.creatorId, data.creator.name);
  const description = data.description?.trim() || '';
  const stake = Math.max(MIN_OBLIGATION_AMOUNT, Math.round(me.data?.monthlyBudget || MIN_OBLIGATION_AMOUNT));

  // Every active pledge counts until the person declines. Confirming a cycle does not change the total.
  const mineTotal = activeObligations.filter((row) => row.userId === userId).reduce((sum, row) => sum + row.amount, 0);
  const othersTotal = activeObligations.filter((row) => row.userId !== userId).reduce((sum, row) => sum + row.amount, 0);

  const typeLabel = data.type === 'REGULAR' ? t('collection.monthly') : t('collection.oneTime');
  let subtitle = typeLabel;
  if (closed) {
    const when = asDate(data.closedAt) ?? asDate(data.updatedAt);
    if (when) subtitle = `${typeLabel} · ${t('collection.closedOn', { date: formatDay(when, language) })}`;
  } else if (data.type === 'REGULAR' && data.cycleNumber > 1) {
    subtitle = `${typeLabel} · ${t('collection.cycleOrdinal', { count: data.cycleNumber })}`;
  } else {
    const opened = asDate(data.createdAt);
    if (opened) subtitle = `${typeLabel} · ${t('collection.opened', { when: relativePast(opened, language) })}`;
  }

  const pathNames = (path.data?.path ?? []).map((person, index) => (
    index === 0 ? t('common.you') : resolve(person.id, person.name)
  ));
  const showPath = !owner && pathNames.length > 1;
  // Stage line (mockups v2): the amount, then the chat, then closed. Reached stages are lit.
  const stages = [t('collection.stageAmount'), t('collection.stageChat'), t('collection.stageClosed')];
  const stageDone = closed ? 3 : owner || myObl ? 2 : 1;
  const showCloseNote = !owner && !closed && !held && !needsConfirm && !goalMet && hasGoal;

  const back = closed
    ? { label: t('collection.pastCrumb'), to: '/me/history' }
    : owner
      ? { label: t('nav.profile'), to: '/me' }
      : { label: t('nav.circle'), to: '/' };

  const people: ParticipantRow[] = activeObligations.map((row) => {
    const mine = row.userId === userId;
    let line = mine ? t('collection.youLower') : direct.has(row.userId) ? t('collection.firstHandshake') : t('collection.inNetwork');
    if (renewal && row.cycleConfirmed === false) line = mine ? t('collection.waitingYou') : t('collection.waiting');
    else if (renewal && row.cycleConfirmed === true && !mine) line = t('collection.confirmed');
    return {
      id: row.id,
      userId: row.userId,
      name: mine ? t('common.you') : resolve(row.userId, row.user.name),
      photoUrl: row.user.photoUrl,
      amount: row.amount,
      paid: row.confirmedAt != null,
      subtitle: line,
      mine,
      joinedViaLink: owner && row.joinedViaLink && row.userId !== userId,
    };
  });

  const cycleEnd = asDate(data.currentCycleStart);
  const cycleUntil = cycleEnd
    ? formatDay(new Date(cycleEnd.getTime() + REGULAR_CYCLE_DAYS * 24 * 60 * 60 * 1000), language)
    : '';

  const share = async () => {
    const url = buildSosInviteUrl(data.id);
    try {
      if (navigator.share) {
        await navigator.share({ title: t('collection.share'), url });
        return;
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const pledgeMessage = (raw: string) => {
    const issue = amountIssue(raw, MIN_OBLIGATION_AMOUNT);
    if (!issue) return '';
    return issue === 'whole' ? t('collection.whole') : t('collection.minOne');
  };

  const join = () => {
    const message = pledgeMessage(joinAmount);
    const amount = parseWhole(joinAmount);
    if (message || amount == null) {
      setJoinError(message || t('collection.minOne'));
      return;
    }
    setJoinError('');
    const place = () => {
      createObligation.mutate({
        collectionId: data.id,
        amount,
        inputCurrency: 'USD',
        isSubscription: data.type === 'REGULAR',
      });
    };
    // A public-link join with no stake yet records that stake, matching the previous collection screen.
    if (isSos && (me.data?.monthlyBudget ?? 0) === 0) {
      setBudget.mutate({ amount, inputCurrency: 'USD' }, { onSettled: place });
      return;
    }
    place();
  };

  // The decision is made: back where the Back action goes. A failure stays on the page and says so.
  const notNow = async () => {
    setLeaving(true);
    setLeaveError(false);
    const ok = await declineNeed(data.id, pendingIds);
    setLeaving(false);
    if (ok) navigate(back.to);
    else setLeaveError(true);
  };

  const saveEdit = () => {
    if (!myObl) return;
    const message = pledgeMessage(editAmount);
    const amount = parseWhole(editAmount);
    if (message || amount == null) {
      setEditError(message || t('collection.minOne'));
      return;
    }
    setEditError('');
    updateObligation.mutate(
      { obligationId: myObl.id, amount, inputCurrency: 'USD' },
      { onSuccess: () => setEditing(false) },
    );
  };

  const confirm = async (amount: number) => {
    if (!myObl) return;
    if (amount < MIN_OBLIGATION_AMOUNT) {
      setEditError(t('collection.minOne'));
      return;
    }
    setEditError('');
    if (amount !== myObl.amount) {
      await updateObligation.mutateAsync({ obligationId: myObl.id, amount, inputCurrency: 'USD' });
    }
    await confirmCycle.mutateAsync({ collectionId: data.id });
    setOtherOpen(false);
    setEditing(false);
  };

  const saveChat = () => {
    if (!isHttpsUrl(chatValue)) {
      setChatError(t('ask.chatInvalid'));
      return;
    }
    setChatError('');
    updateChat.mutate(
      { id: data.id, chatLink: chatValue.trim() },
      { onSuccess: () => setChatEditing(false) },
    );
  };

  const saveDescription = () => {
    setDescError('');
    updateDescription.mutate(
      { id: data.id, description: descValue.trim() },
      { onSuccess: () => setDescEditing(false), onError: () => setDescError(t('common.error')) },
    );
  };

  const saveGoal = () => {
    const issue = amountIssue(goalAmount, MIN_COLLECTION_AMOUNT);
    const amount = parseWhole(goalAmount);
    if (issue || amount == null) {
      setGoalError(issue === 'whole' ? t('ask.whole') : t('ask.minAmount'));
      return;
    }
    setGoalError('');
    updateGoal.mutate({ id: data.id, amount, inputCurrency: 'USD' });
  };

  const sosUrl = buildSosInviteUrl(data.id);
  const headerAction = showAdmin ? (
    <Button variant="text" onClick={() => { setReason(null); setAdminOpen(true); }}>
      {held ? t('collection.resume') : t('collection.suspend')}
    </Button>
  ) : showDecline ? (
    <Button variant="textDanger" onClick={() => setDeclineOpen(true)}>{t('collection.decline')}</Button>
  ) : null;

  return (
    <Screen
      width="column"
      back={back}
      title={desktop ? (owner ? t('collection.yours') : t('collection.title')) : undefined}
      action={headerAction}
    >
      <Card className="mt-2">
        {showPath ? <div className="mb-4"><PathFigure names={pathNames} /></div> : null}
        <div className="flex items-center gap-3">
          <Avatar name={creatorName} src={data.creator.photoUrl} size={48} />
          <div className="min-w-0">
            <button type="button" className="so-focus block truncate text-title font-extrabold" onClick={() => navigate(`/person/${data.creatorId}`)}>
              {creatorName}
            </button>
            <p className="mt-0.5 text-label font-semibold text-ink-muted">{subtitle}</p>
          </div>
        </div>
        {description && (!owner || closed) ? (
          <p dir="auto" className="mt-3 whitespace-pre-line break-words text-body-s font-semibold text-ink">{description}</p>
        ) : null}
        {hasGoal ? (
          <Meter mine={mineTotal} others={othersTotal} goal={data.amount ?? 0} showMine={!owner && mineTotal > 0} />
        ) : (
          <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.noGoal')}</p>
        )}
        <StageRail steps={stages} done={stageDone} />
        {showCloseNote ? (
          <p className="mt-3 text-label font-semibold text-ink-muted">
            {t('collection.closesNote', { name: firstName(creatorName) })}
          </p>
        ) : null}
      </Card>

      {communityHold ? <CommunityHoldNote owner={owner} onSupport={openAssistant} /> : null}

      {adminHold ? (
        <div className="mt-3 rounded-xl bg-sos-soft px-4 py-3 text-body-s font-semibold text-sos">
          <p className="font-extrabold">{t('collection.suspended')}</p>
          {owner && isReason(data.blockReason) ? (
            <p className="mt-1">{t('collection.suspendedReason', { reason: t(`collection.reason.${data.blockReason}`) })}</p>
          ) : null}
          {owner ? (
            <Button variant="text" className="mt-1 px-0 text-sos" onClick={openAssistant}>
              {t('collection.writeSupport')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {owner && !hasGoal && !closed && !held ? (
        <Card className="mt-3">
          <Input
            variant="money"
            label={t('collection.noGoal')}
            value={goalAmount}
            onValueChange={(value) => { setGoalAmount(value); setGoalError(''); }}
            error={goalError}
          />
          <Button className="mt-3 w-full" loading={updateGoal.isPending} onClick={saveGoal}>{t('collection.saveGoal')}</Button>
        </Card>
      ) : null}

      {!owner && !myObl && data.status === 'ACTIVE' && !held ? (
        <Card className="mt-3">
          <Input
            variant="money"
            label={t('collection.yourAmount')}
            value={joinAmount}
            onValueChange={(value) => { setJoinAmount(value); setJoinError(''); }}
            error={joinError}
            hint={joinError ? undefined : t('collection.minStake', { amount: formatMoney(stake) })}
          />
          <Button className="mt-4 w-full" loading={createObligation.isPending || setBudget.isPending} disabled={offline} onClick={join}>{t('collection.participate')}</Button>
          {offline ? <OfflineHint /> : null}
          {waitsForMe ? (
            <Button variant="text" className="mt-2 min-h-11 w-full" loading={leaving} disabled={offline} onClick={notNow}>{t('invite.notNow')}</Button>
          ) : null}
          {leaveError ? <p role="alert" className="mt-2 text-label font-semibold text-sos">{t('common.error')}</p> : null}
        </Card>
      ) : null}

      {!owner && !myObl && goalMet ? (
        <Card className="mt-3">
          <p className="text-body-s font-semibold text-ink-muted">{t('collection.goalReached')}</p>
        </Card>
      ) : null}

      {needsConfirm && myObl ? (
        <Card className="mt-3">
          <div className="flex items-start gap-3 rounded-lg bg-warm-soft p-3 text-caption font-semibold text-warm-ink">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-surface">
              <IconClock className="h-5 w-5" />
            </span>
            <p>
              <b className="font-extrabold">{t('collection.cycleUntil', { date: cycleUntil })}</b>{' '}
              {t('collection.cycleElse', { amount: formatMoney(myObl.amount) })}
            </p>
          </div>
          {otherOpen ? (
            <div className="mt-3">
              <Input variant="money" label={t('collection.otherAmount')} value={editAmount} onValueChange={setEditAmount} error={editError} />
              <Button
                className="mt-3 w-full"
                loading={confirmCycle.isPending || updateObligation.isPending}
                onClick={() => {
                  const message = pledgeMessage(editAmount);
                  const amount = parseWhole(editAmount);
                  if (message || amount == null) {
                    setEditError(message || t('collection.minOne'));
                    return;
                  }
                  confirm(amount).catch(() => setEditError(t('common.error')));
                }}
              >
                {t('collection.confirmAmount', { amount: formatMoney(parseWhole(editAmount) ?? myObl.amount) })}
              </Button>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2.5">
              <Button
                className="w-full"
                loading={confirmCycle.isPending}
                onClick={() => confirm(myObl.amount).catch(() => setEditError(t('common.error')))}
              >
                {t('collection.confirmAmount', { amount: formatMoney(myObl.amount) })}
              </Button>
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => { setEditAmount(String(myObl.amount)); setEditError(''); setOtherOpen(true); }}
              >
                {t('collection.otherAmount')}
              </Button>
              {editError ? <p className="text-label font-semibold text-sos">{editError}</p> : null}
            </div>
          )}
        </Card>
      ) : null}

      {!owner && myObl && !needsConfirm && !closed && !held ? (
        <Card className="mt-3">
          {editing ? (
            <>
              <Input variant="money" label={t('collection.yourAmount')} value={editAmount} onValueChange={setEditAmount} error={editError} />
              {/* Two full-size buttons side by side: Cancel is as easy to reach as Save */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="w-full" onClick={() => setEditing(false)}>{t('common.cancel')}</Button>
                <Button className="w-full" loading={updateObligation.isPending} onClick={saveEdit}>{t('collection.saveAmount')}</Button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <b className="block text-h3 font-extrabold tabular-nums">{formatMoney(myObl.amount)}</b>
                <span className="text-label font-semibold text-ink-muted">{t('collection.youParticipate')}</span>
              </div>
              <Button
                variant="secondary"
                size="md"
                onClick={() => { setEditAmount(String(myObl.amount)); setEditError(''); setEditing(true); }}
              >
                {t('collection.change')}
              </Button>
            </div>
          )}
          {/* Hidden while the amount is edited: one main action at a time */}
          {isHttpsUrl(data.chatLink) && !editing ? (
            <Button className="mt-4 w-full" icon={<IconChat />} onClick={() => window.open(data.chatLink, '_blank', 'noopener,noreferrer')}>
              {t('collection.openCollectionChat')}
            </Button>
          ) : null}
          <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.moneyNote')}</p>
          {showAdmin && showDecline ? (
            <Button variant="textDanger" className="mt-2 w-full" onClick={() => setDeclineOpen(true)}>{t('collection.decline')}</Button>
          ) : null}
        </Card>
      ) : null}

      {owner && !closed ? (
        <Card className="mt-3">
          {descEditing ? (
            <div className="mb-3">
              <Textarea
                label={t('collection.descLabel')}
                value={descValue}
                placeholder={t('ask.descPlaceholder')}
                max={DESCRIPTION_MAX}
                error={descError}
                onChange={(event) => { setDescValue(event.target.value); setDescError(''); }}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="w-full" onClick={() => setDescEditing(false)}>{t('common.cancel')}</Button>
                <Button className="w-full" loading={updateDescription.isPending} onClick={saveDescription}>{t('collection.saveAmount')}</Button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className="so-focus mb-3 flex min-h-row w-full items-center gap-3 rounded-lg bg-canvas px-3.5 py-3 text-start"
              onClick={() => { setDescValue(description); setDescError(''); setDescEditing(true); }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-micro font-semibold text-ink-muted">{t('collection.descLabel')}</span>
                <span dir="auto" className={description ? 'line-clamp-3 block whitespace-pre-line break-words text-body-s font-extrabold' : 'block text-body-s font-semibold text-ink-muted'}>
                  {description || t('collection.descAdd')}
                </span>
              </span>
              <IconPen className="h-5 w-5 shrink-0 text-care" />
            </button>
          )}
          {chatEditing ? (
            <>
              <Input
                label={t('collection.chatLabel')}
                value={chatValue}
                error={chatError}
                inputMode="url"
                autoCapitalize="none"
                onChange={(event) => { setChatValue(event.target.value); setChatError(''); }}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <Button variant="secondary" className="w-full" onClick={() => setChatEditing(false)}>{t('common.cancel')}</Button>
                <Button className="w-full" loading={updateChat.isPending} onClick={saveChat}>{t('collection.saveAmount')}</Button>
              </div>
            </>
          ) : (
            <button
              type="button"
              className="so-focus flex w-full items-center gap-3 rounded-lg bg-canvas px-3.5 py-3 text-left"
              onClick={() => { setChatValue(data.chatLink); setChatError(''); setChatEditing(true); }}
            >
              <span className="min-w-0 flex-1">
                <span className="block text-micro font-semibold text-ink-muted">{t('collection.chatLabel')}</span>
                <span className="block truncate text-body-s font-extrabold">{shortUrl(data.chatLink)}</span>
              </span>
              <IconPen className="h-5 w-5 shrink-0 text-care" />
            </button>
          )}
          {!held ? (
            <>
              {/* The share button may shrink (minmax(0,1fr)) and carries the short label, so the QR button always keeps its 56 px */}
              <div className="mt-3 grid grid-cols-[minmax(0,1fr)_56px] gap-2.5">
                <Button className="w-full min-w-0" icon={<IconShare />} aria-label={t('collection.share')} onClick={share}>
                  {copied ? t('collection.shareCopied') : t('add.share')}
                </Button>
                <Button variant="secondary" className="w-full px-0" aria-label={t('collection.qrSheetTitle')} onClick={() => setQrOpen(true)}>
                  <IconQr className="h-5 w-5" />
                </Button>
              </div>
              <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.publicWarning')}</p>
            </>
          ) : null}
        </Card>
      ) : null}

      {owner && !closed ? (
        // The author marks transfers: one tap with undo, or several at once in a sheet
        <MarkableParticipantList
          people={people}
          onPerson={(userIdToOpen) => navigate(`/person/${userIdToOpen}`)}
          onRemove={setRemoveTarget}
          onSaved={refresh}
          onCloseCollection={() => setCloseOpen(true)}
        />
      ) : (
        <ParticipantList people={people} showPaid={false} onPerson={(userIdToOpen) => navigate(`/person/${userIdToOpen}`)} />
      )}

      {owner && data.type === 'REGULAR' ? <PreviousCycles collectionId={data.id} /> : null}

      {owner && !closed ? (
        <Button variant="secondary" className="mt-5 w-full border-sos/40 text-sos hover:bg-sos/10" onClick={() => setCloseOpen(true)}>
          {t('collection.close')}
        </Button>
      ) : null}

      {!owner && !closed && !held ? <ComplainEntry collectionId={data.id} /> : null}

      <QrSheet open={qrOpen} url={sosUrl} onClose={() => setQrOpen(false)} />

      <Sheet
        open={declineOpen}
        onClose={() => setDeclineOpen(false)}
        title={t('collection.declineTitle')}
        footer={sheetPair(
          desktop,
          <Button variant="danger" className="w-full" loading={decline.isPending} onClick={() => decline.mutate({ collectionId: data.id }, { onSuccess: () => setDeclineOpen(false) })}>
            {t('collection.decline')}
          </Button>,
          <Button variant="secondary" className="w-full" onClick={() => setDeclineOpen(false)}>{t('collection.stay')}</Button>,
          true,
        )}
      />

      <Sheet
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        title={t('collection.closeTitle')}
        description={hasGoal ? t('collection.closeBody', { current: formatMoney(data.currentAmount), goal: formatMoney(data.amount ?? 0) }) : t('collection.noGoal')}
        footer={sheetPair(
          desktop,
          <Button variant="danger" className="w-full" loading={closeCollection.isPending} onClick={() => closeCollection.mutate({ id: data.id }, { onSuccess: () => setCloseOpen(false) })}>
            {t('collection.close')}
          </Button>,
          <Button variant="secondary" className="w-full" onClick={() => setCloseOpen(false)}>{t('collection.stay')}</Button>,
          true,
        )}
      />

      <Sheet
        open={removeTarget != null}
        onClose={() => setRemoveTarget(null)}
        title={removeTarget ? t('collection.removeTitle', { name: removeTarget.name }) : ''}
        description={t('collection.removeBody')}
        footer={sheetPair(
          desktop,
          <Button
            variant="danger"
            className="w-full"
            loading={removeJoiner.isPending}
            onClick={() => {
              if (!removeTarget) return;
              removeJoiner.mutate(
                { collectionId: data.id, userId: removeTarget.userId },
                { onSuccess: () => setRemoveTarget(null) },
              );
            }}
          >
            {t('collection.removeYes')}
          </Button>,
          <Button variant="secondary" className="w-full" onClick={() => setRemoveTarget(null)}>{t('collection.stay')}</Button>,
          true,
        )}
      />

      <Sheet
        open={adminOpen}
        onClose={() => setAdminOpen(false)}
        title={held ? t('collection.resumeTitle') : t('collection.suspendTitle')}
        description={held ? t('collection.resumeBody') : undefined}
        footer={sheetPair(
          desktop,
          <Button
            variant={held ? 'primary' : 'danger'}
            className="w-full"
            loading={block.isPending || unblock.isPending}
            disabled={!held && reason == null}
            onClick={() => {
              if (held) {
                unblock.mutate({ id: data.id }, { onSuccess: () => setAdminOpen(false) });
                return;
              }
              if (!reason) return;
              block.mutate({ id: data.id, reason }, { onSuccess: () => setAdminOpen(false) });
            }}
          >
            {held ? t('collection.resume') : t('collection.suspend')}
          </Button>,
          <Button variant="secondary" className="w-full" onClick={() => setAdminOpen(false)}>{t('common.cancel')}</Button>,
          !held,
        )}
      >
        {held ? null : (
          <div className="flex flex-col gap-2">
            {REASONS.map((item) => (
              <button
                key={item}
                type="button"
                aria-pressed={reason === item}
                onClick={() => setReason(item)}
                className={reason === item
                  ? 'so-focus min-h-row rounded-lg bg-ink px-4 text-left text-body font-bold text-canvas'
                  : 'so-focus min-h-row rounded-lg border border-line bg-canvas px-4 text-left text-body font-bold text-ink'}
              >
                {t(`collection.reason.${item}`)}
              </button>
            ))}
          </div>
        )}
      </Sheet>

    </Screen>
  );
}
