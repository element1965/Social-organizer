import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useNicknames } from '../hooks/useNicknames';
import { Avatar } from '../components/ui2/Avatar';
import { Meter } from '../components/ui2/Meter';
import { Pill } from '../components/ui2/Pill';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { trpcCode } from '../components/profile/errors';
import { QueryState } from '../components/profile/QueryState';
import { countForm, cycleDeadline, isOpenParticipation, isPastParticipation } from '../components/profile/collections';
import { formatDayMonth } from '../components/profile/dates';
import { useSmartBack } from '../components/profile/useSmartBack';
import { ParticipationSummary } from '../components/profile/ParticipationSummary';

type ActiveRow = {
  id: string;
  type: string;
  status: string;
  amount: number | null;
  currentAmount: number;
  currentCycleStart: Date | string | null;
  cycleNumber: number;
  createdAt: Date | string;
  _count: { obligations: number };
};

type JoinRow = {
  id: string;
  amount: number;
  unsubscribedAt: Date | string | null;
  createdAt: Date | string;
  collection: {
    id: string;
    type: string;
    status: string;
    amount: number | null;
    currentCycleStart: Date | string | null;
    cycleNumber: number;
    creator: { id: string; name: string; photoUrl: string | null };
  };
};

function timeOf(value: Date | string | null | undefined): number {
  if (value == null) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

/** True once `node` is near the viewport. Queries stay unmounted until then. */
function useWhenVisible<T extends Element>(): [(node: T | null) => void, boolean] {
  const [node, setNode] = useState<T | null>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!node || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '120px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, visible]);
  return [setNode, visible];
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  const me = trpc.user.me.useQuery();
  const active = trpc.collection.myActive.useQuery();
  const participating = trpc.collection.myParticipating.useQuery();
  const history = trpc.collection.myHistory.useQuery(undefined, { retry: false });
  const help = trpc.stats.help.useQuery();
  const facts = trpc.stats.participationFacts.useQuery();
  const [picked, setTab] = useState<'open' | 'past' | null>(null);

  // An API that has not loaded this procedure yet must not blank Open and Past.
  const historyMissing = history.isError && trpcCode(history.error) === 'NOT_FOUND';
  const loading = me.isLoading || active.isLoading || participating.isLoading || (history.isLoading && !history.isError);
  const failed = me.isError || active.isError || participating.isError || (history.isError && !historyMissing);
  const retry = () => {
    void me.refetch();
    void active.refetch();
    void participating.refetch();
    void history.refetch();
  };

  const selfId = me.data?.id ?? '';
  const openRows = [
    ...(active.data ?? []).map((row) => ({ kind: 'own' as const, at: timeOf(row.createdAt), row })),
    ...(participating.data ?? [])
      .filter((row) => isOpenParticipation(row, selfId))
      .map((row) => ({ kind: 'join' as const, at: timeOf(row.createdAt), row })),
  ].sort((a, b) => b.at - a.at);
  const pastRows = [
    ...(history.data ?? []).map((row) => ({
      kind: 'own' as const,
      at: timeOf(row.closedAt ?? row.createdAt),
      row,
    })),
    ...(participating.data ?? [])
      .filter((row) => isPastParticipation(row, selfId))
      .map((row) => ({ kind: 'join' as const, at: timeOf(row.createdAt), row })),
  ].sort((a, b) => b.at - a.at);

  // Nothing open but something past: show Past straight away instead of an empty Open tab.
  const tab = picked ?? (!loading && openRows.length === 0 && pastRows.length > 0 ? 'past' : 'open');

  return (
    <Screen title={t('collection.pastCrumb')} back={back} width="column">
      {help.data ? <ParticipationSummary given={help.data.given} received={help.data.received} facts={facts.data} /> : null}
      <div className="mt-2">
        <Segmented
          label={t('profile.collections')}
          value={tab}
          onChange={setTab}
          options={[
            { value: 'open', label: t('profile.openTab') },
            { value: 'past', label: t('profile.pastTab') },
          ]}
        />
      </div>
      {loading || failed || !me.data ? (
        <QueryState isLoading={loading && !failed} isError={failed} onRetry={retry} />
      ) : tab === 'open' ? (
        openRows.length === 0 ? (
          <p className="py-8 text-center text-body font-semibold text-ink-muted">{t('profile.noOpen')}</p>
        ) : (
          <div className="so-stagger mt-3 space-y-3">
            {openRows.map((entry) =>
              entry.kind === 'own' ? (
                <OwnCard key={entry.row.id} row={entry.row} meName={me.data.name} mePhoto={me.data.photoUrl} lang={i18n.language} />
              ) : (
                <JoinCard key={entry.row.id} row={entry.row} lang={i18n.language} />
              ),
            )}
          </div>
        )
      ) : pastRows.length === 0 ? (
        <p className="py-8 text-center text-body font-semibold text-ink-muted">{t('profile.noPast')}</p>
      ) : (
        <div className="so-stagger mt-3 space-y-3">
          {pastRows.map((entry) =>
            entry.kind === 'own' ? (
              <OwnCard key={`own-${entry.row.id}`} row={entry.row} meName={me.data.name} mePhoto={me.data.photoUrl} lang={i18n.language} />
            ) : (
              <JoinCard key={entry.row.id} row={entry.row} lang={i18n.language} past />
            ),
          )}
        </div>
      )}
    </Screen>
  );
}

function kindLabel(type: string, t: (key: string) => string): string {
  return type === 'REGULAR' ? t('profile.every28') : t('profile.once');
}

function cycleText(
  type: string,
  cycleNumber: number,
  start: Date | string | null,
  lang: string,
  t: (key: string, options?: Record<string, unknown>) => string,
): string | null {
  if (type !== 'REGULAR') return null;
  const until = cycleDeadline(start);
  if (until) return t('profile.newCycleUntil', { date: formatDayMonth(until, lang) });
  if (cycleNumber > 1) return t('profile.cycleN', { n: cycleNumber });
  return null;
}

function OwnCard({
  row,
  meName,
  mePhoto,
  lang,
}: {
  row: ActiveRow;
  meName: string;
  mePhoto: string | null;
  lang: string;
}) {
  const { t } = useTranslation();
  const cycle = cycleText(row.type, row.cycleNumber, row.currentCycleStart, lang, t);
  const form = countForm(row._count.obligations, lang);
  const participants = t(
    form === 'one' ? 'profile.participantOne' : form === 'few' ? 'profile.participantFew' : 'profile.participantMany',
    { count: row._count.obligations },
  );
  const meta = [t('profile.yourCollection'), participants, cycle]
    .filter(Boolean)
    .join(' · ');
  return (
    <Link to={`/collection/${row.id}`} className="so-focus block rounded-lg bg-surface p-4 shadow-card">
      <CardHead
        name={meName}
        photo={mePhoto}
        title={kindLabel(row.type, t)}
        meta={meta}
        paused={row.status === 'BLOCKED'}
      />
      {row.amount && row.amount > 0 ? (
        <Meter mine={0} others={row.currentAmount} goal={row.amount} showMine={false} />
      ) : (
        <p className="mt-2 text-label font-semibold text-ink-muted">{t('profile.goalMissing')}</p>
      )}
    </Link>
  );
}

function JoinCard({ row, lang, past = false }: { row: JoinRow; lang: string; past?: boolean }) {
  const { t } = useTranslation();
  const resolve = useNicknames();
  const [ref, visible] = useWhenVisible<HTMLDivElement>();
  const creator = row.collection.creator;
  const cycle = cycleText(row.collection.type, row.collection.cycleNumber, row.collection.currentCycleStart, lang, t);
  const role = past && row.unsubscribedAt ? t('profile.left') : t('profile.participating');
  return (
    <div ref={ref}>
      <Link to={`/collection/${row.collection.id}`} className="so-focus block rounded-lg bg-surface p-4 shadow-card">
        <CardHead
          name={creator.name}
          photo={creator.photoUrl}
          title={resolve(creator.id, creator.name)}
          meta={[role, cycle].filter(Boolean).join(' · ')}
          viaUserId={visible ? creator.id : undefined}
          paused={row.collection.status === 'BLOCKED'}
        />
        {visible ? <JoinMeter collectionId={row.collection.id} mine={row.amount} /> : null}
      </Link>
    </div>
  );
}

function CardHead({
  name,
  photo,
  title,
  meta,
  viaUserId,
  paused,
}: {
  name: string;
  photo: string | null;
  title: string;
  meta: string;
  viaUserId?: string;
  paused: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start gap-3">
      <Avatar name={name} src={photo} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-body font-body text-ink">{title}</p>
          {paused ? <Pill tone="warm">{t('profile.paused')}</Pill> : null}
        </div>
        <p className="mt-0.5 text-label font-semibold text-ink-muted">
          {meta}
          {viaUserId ? <ViaSuffix userId={viaUserId} /> : null}
        </p>
      </div>
    </div>
  );
}

function ViaSuffix({ userId }: { userId: string }) {
  const { t } = useTranslation();
  const resolve = useNicknames();
  const path = trpc.connection.findPath.useQuery({ targetUserId: userId });
  const nodes = path.data?.path ?? [];
  if (nodes.length <= 2) return null;
  const via = nodes[nodes.length - 2];
  if (!via) return null;
  return <span>{` · ${t('profile.pastVia', { name: resolve(via.id, via.name) })}`}</span>;
}

function JoinMeter({ collectionId, mine }: { collectionId: string; mine: number }) {
  const { t } = useTranslation();
  const query = trpc.collection.getById.useQuery({ id: collectionId });
  if (!query.data) return null;
  const goal = query.data.amount ?? 0;
  if (goal <= 0) {
    return <p className="mt-2 text-label font-semibold text-ink-muted">{t('profile.goalMissing')}</p>;
  }
  return <Meter mine={mine} others={Math.max(0, query.data.currentAmount - mine)} goal={goal} showMine />;
}
