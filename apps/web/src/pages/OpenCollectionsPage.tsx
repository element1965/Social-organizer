import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Avatar } from '../components/ui2/Avatar';
import { Button } from '../components/ui2/Button';
import { Card } from '../components/ui2/Card';
import { Meter } from '../components/ui2/Meter';
import { Screen } from '../components/ui2/Screen';
import { useNicknames } from '../hooks/useNicknames';
import { trpc } from '../lib/trpc';

type OpenCard = {
  id: string;
  name: string;
  photoUrl: string | null;
  role: string;
  stage: string;
  mine: number;
  others: number;
  goal: number | null;
  /** Null when the payload has no collected total, so the card does not invent a zero bar. */
  current: number | null;
  showMine: boolean;
  createdAt: string | Date;
};

export function OpenCollectionsPage() {
  const { t } = useTranslation();
  const resolve = useNicknames();
  const me = trpc.user.me.useQuery();
  const mine = trpc.collection.myActive.useQuery();
  const joined = trpc.collection.myParticipating.useQuery();

  const cards = useMemo(() => {
    const rows: OpenCard[] = [];
    const seen = new Set<string>();
    const stageOf = (status: string, blockReason: string | null, type: string) => {
      if (status === 'BLOCKED' && blockReason) return t('collection.suspended');
      if (status === 'BLOCKED') return t('collection.goalReached');
      // The role line above already says whose collection it is and that you are in it.
      return type === 'REGULAR' ? t('collection.monthly') : t('collection.oneTime');
    };

    for (const col of mine.data ?? []) {
      seen.add(col.id);
      const goal = col.amount != null && col.amount > 0 ? col.amount : null;
      rows.push({
        id: col.id,
        name: me.data?.name ?? t('common.you'),
        photoUrl: me.data?.photoUrl ?? null,
        role: t('collection.roleYours'),
        stage: stageOf(col.status, col.blockReason, col.type),
        mine: 0,
        others: typeof col.currentAmount === 'number' ? col.currentAmount : 0,
        goal,
        current: typeof col.currentAmount === 'number' ? col.currentAmount : null,
        showMine: false,
        createdAt: col.createdAt,
      });
    }

    for (const row of joined.data ?? []) {
      const col = row.collection;
      if (seen.has(col.id)) continue;
      if (col.status !== 'ACTIVE' && col.status !== 'BLOCKED') continue;
      const goal = col.amount != null && col.amount > 0 ? col.amount : null;
      const reported = col.currentAmount;
      const known = typeof reported === 'number';
      rows.push({
        id: col.id,
        name: resolve(col.creator.id, col.creator.name),
        photoUrl: col.creator.photoUrl,
        role: t('collection.roleJoined'),
        stage: stageOf(col.status, col.blockReason, col.type),
        mine: row.amount,
        others: known ? Math.max(0, reported - row.amount) : 0,
        goal,
        current: known ? reported : null,
        showMine: row.amount > 0,
        createdAt: col.createdAt,
      });
    }

    return rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [mine.data, joined.data, me.data, resolve, t]);

  const loading = mine.isLoading || joined.isLoading;
  const failed = mine.isError || joined.isError;

  return (
    <Screen width="column" title={t('collection.openTitle')} back={{ label: t('nav.profile'), to: '/me' }}>
      {loading ? <p className="pt-6 text-body-s font-semibold text-ink-muted">{t('common.loading')}</p> : null}
      {!loading && failed ? (
        <Card className="mt-4">
          <p>{t('common.error')}</p>
          <Button
            className="mt-3 w-full"
            onClick={() => {
              mine.refetch();
              joined.refetch();
            }}
          >
            {t('common.retry')}
          </Button>
        </Card>
      ) : null}
      {!loading && !failed && cards.length === 0 ? (
        <p className="pt-10 text-center text-body-s font-semibold text-ink-muted">{t('collection.openEmpty')}</p>
      ) : null}
      {!loading && !failed ? (
        <div className="mt-2 flex flex-col gap-3">
          {cards.map((card) => (
            <Link key={card.id} to={`/collection/${card.id}`} className="so-focus block rounded-xl bg-surface p-4 text-ink shadow-card">
              <span className="flex items-center gap-3">
                <Avatar name={card.name} src={card.photoUrl} size={48} />
                <span className="min-w-0">
                  <span className="block text-micro font-bold text-care">{card.role}</span>
                  <span className="mt-0.5 block truncate text-title font-extrabold">{card.name}</span>
                  <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{card.stage}</span>
                </span>
              </span>
              {card.goal != null && card.current != null ? (
                <Meter mine={card.mine} others={card.others} goal={card.goal} showMine={card.showMine} />
              ) : card.goal == null ? (
                <p className="mt-3 text-label font-semibold text-ink-muted">{t('collection.noGoal')}</p>
              ) : null}
            </Link>
          ))}
        </div>
      ) : null}
    </Screen>
  );
}
