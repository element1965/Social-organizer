import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { Avatar } from '../components/ui2/Avatar';
import { Group, Row } from '../components/ui2/Group';
import { Input } from '../components/ui2/Input';
import { Pill } from '../components/ui2/Pill';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { formatMoney } from '../components/ui2/format';
import { QueryState } from '../components/profile/QueryState';
import { useSmartBack } from '../components/profile/useSmartBack';

export function AdminStatsPage() {
  const { t } = useTranslation();
  const back = useSmartBack(t('common.back'), '/me');
  const admin = trpc.faq.isAdmin.useQuery();
  const isAdmin = admin.data?.isAdmin === true;
  const users = trpc.stats.adminAllUsersStats.useQuery(undefined, { enabled: isAdmin });
  const clusters = trpc.cluster.list.useQuery(undefined, { enabled: isAdmin });
  const [tab, setTab] = useState<'people' | 'clusters'>('people');
  const [search, setSearch] = useState('');

  if (admin.isLoading) {
    return (
      <Screen title={t('profile.statistics')} back={back} width="column">
        <QueryState isLoading />
      </Screen>
    );
  }
  if (!isAdmin) return <Navigate to="/me" replace />;

  const list = users.data ?? [];
  const filtered = list.filter((user) => !search.trim() || user.name.toLowerCase().includes(search.trim().toLowerCase()));
  const clusterCount = new Set(list.map((user) => user.clusterRootId)).size;
  const invites = list.reduce((sum, user) => sum + user.inviteCount, 0);

  return (
    <Screen title={t('profile.statistics')} back={back} width="column">
      <Segmented
        className="mt-2"
        label={t('profile.statistics')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'people', label: t('profile.peopleTab') },
          { value: 'clusters', label: t('profile.clustersTab') },
        ]}
      />
      {tab === 'people' ? (
        users.isLoading || users.isError ? (
          <QueryState isLoading={users.isLoading} isError={users.isError} onRetry={() => void users.refetch()} />
        ) : (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <Stat value={String(list.length)} label={t('adminStats.totalUsers')} />
              <Stat value={String(clusterCount)} label={t('adminStats.totalClusters')} />
              <Stat value={String(invites)} label={t('adminStats.totalInvites')} />
            </div>
            <div className="mt-3">
              <Input variant="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('adminStats.search')} aria-label={t('adminStats.search')} />
            </div>
            <div className="mt-3 overflow-hidden rounded-lg bg-surface shadow-card">
              {filtered.length === 0 ? (
                <p className="py-6 text-center text-body-s font-semibold text-ink-muted">{t('adminStats.noResults')}</p>
              ) : (
                filtered.map((user, index) => (
                  <Link
                    key={user.id}
                    to={`/person/${user.id}`}
                    className="so-focus flex items-center gap-3 border-b border-line-soft px-4 py-2.5 last:border-b-0"
                  >
                    <span className="w-6 text-right text-label font-bold text-ink-subtle">{index + 1}</span>
                    <Avatar name={user.name} src={user.photoUrl} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body font-body text-ink">{user.name}</span>
                      <span className="block truncate text-label font-semibold text-ink-muted">
                        {`${user.clusterRootName} · ${formatMoney(user.remainingBudget)}`}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-body font-bold tabular-nums text-ink">{user.inviteCount}</span>
                      <span className="block text-micro font-semibold text-ink-muted">{t('adminStats.invitedCount')}</span>
                    </span>
                  </Link>
                ))
              )}
            </div>
          </>
        )
      ) : clusters.isLoading || clusters.isError ? (
        <QueryState isLoading={clusters.isLoading} isError={clusters.isError} onRetry={() => void clusters.refetch()} />
      ) : (
        <Group>
          {(clusters.data ?? []).length === 0 ? (
            <p className="px-4 py-6 text-center text-body-s font-semibold text-ink-muted">{t('adminStats.noResults')}</p>
          ) : (
            (clusters.data ?? []).map((cluster) => (
              <Row
                key={cluster.rootUserId}
                title={cluster.rootUserName}
                subtitle={`${t('cluster.members')} ${cluster.memberCount} · ${t('cluster.budget')} ${formatMoney(cluster.totalBudget)}`}
                to={`/person/${cluster.rootUserId}`}
                variant="link"
                trailing={cluster.isMine ? <Pill tone="care">{t('common.you')}</Pill> : undefined}
              />
            ))
          )}
        </Group>
      )}
    </Screen>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-lg bg-surface px-2 py-3 text-center shadow-card">
      <p className="text-h3 font-extrabold tabular-nums text-ink">{value}</p>
      <p className="text-micro font-bold text-ink-muted">{label}</p>
    </div>
  );
}
