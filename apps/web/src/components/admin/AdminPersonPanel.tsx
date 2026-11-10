import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../../lib/trpc';
import { Group, Row } from '../ui2/Group';
import { Pill } from '../ui2/Pill';
import { PersonRow } from '../ui2/PersonRow';
import { Segmented } from '../ui2/Segmented';
import { Sheet } from '../ui2/Sheet';
import { formatMoney } from '../ui2/format';
import { formatLongDate } from '../profile/dates';
import { kyivDayCount } from './adminDay';

type Props = {
  userId: string;
  createdAt: Date | string | null | undefined;
  remainingBudget: number | null | undefined;
};

/**
 * Admin-only block on a person's page: what the old profile showed admins
 * (budget, activity counters, participation history, their connections).
 * The caller renders it only for admins; the queries are gated on that too.
 */
export function AdminPersonPanel({ userId, createdAt, remainingBudget }: Props) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const stats = trpc.stats.profile.useQuery({ userId });
  const history = trpc.stats.helpHistory.useQuery({ userId });
  const connections = trpc.connection.listForUser.useQuery({ userId });
  const [tab, setTab] = useState<'given' | 'received'>('given');
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const rows = tab === 'given' ? history.data?.helped ?? [] : history.data?.helpedBy ?? [];
  const people = connections.data ?? [];
  const open = (id: string) => {
    setConnectionsOpen(false);
    navigate(`/person/${id}`);
  };

  return (
    <section className="mt-6">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <h2 className="text-label font-bold text-ink-muted">{t('profile.adminsOnly')}</h2>
        <Pill tone="warm">{t('profile.adminBadge')}</Pill>
      </div>
      <Group>
        <Row
          title={t('adminPerson.budget')}
          value={formatMoney(Math.round(remainingBudget ?? 0))}
          variant="value"
          chevron={false}
        />
        {createdAt ? (
          <Row
            title={t('adminPerson.registered')}
            value={t('adminPerson.registeredValue', {
              date: formatLongDate(createdAt, i18n.language),
              n: kyivDayCount(createdAt),
            })}
            variant="value"
            chevron={false}
          />
        ) : null}
        <Row
          title={t('adminPerson.connections')}
          value={String(stats.data?.connectionsCount ?? people.length)}
          variant="value"
          chevron={people.length > 0}
          onClick={people.length > 0 ? () => setConnectionsOpen(true) : undefined}
        />
        {stats.data ? (
          <>
            <Row title={t('adminPerson.needsCreated')} value={String(stats.data.collectionsCreated)} variant="value" chevron={false} />
            <Row title={t('adminPerson.needsOpen')} value={String(stats.data.collectionsActive)} variant="value" chevron={false} />
            <Row title={t('adminPerson.needsWithHelp')} value={String(stats.data.collectionsWithHelp)} variant="value" chevron={false} />
            <Row title={t('adminPerson.tookPartIn')} value={String(stats.data.collectionsHelped)} variant="value" chevron={false} />
          </>
        ) : null}
      </Group>

      <Segmented
        className="mt-4"
        label={t('adminPerson.historyLabel')}
        value={tab}
        onChange={setTab}
        options={[
          { value: 'given', label: t('adminPerson.given', { n: new Set((history.data?.helped ?? []).map((h) => h.userId)).size }) },
          { value: 'received', label: t('adminPerson.received', { n: new Set((history.data?.helpedBy ?? []).map((h) => h.userId)).size }) },
        ]}
      />
      <div className="mt-2 max-h-80 overflow-y-auto rounded-lg bg-surface shadow-card">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-body-s font-semibold text-ink-muted">
            {history.isLoading ? t('common.loading') : history.isError ? t('common.error') : t('profile.noPast')}
          </p>
        ) : (
          <div className="divide-y divide-line-soft">
            {rows.map((row) => (
              <PersonRow
                key={row.id}
                name={row.name}
                src={row.photoUrl}
                subtitle={formatLongDate(row.createdAt, i18n.language)}
                value={formatMoney(Math.round(row.amount))}
                onClick={() => open(row.userId)}
              />
            ))}
          </div>
        )}
      </div>

      <Sheet open={connectionsOpen} onClose={() => setConnectionsOpen(false)} title={t('adminPerson.connections')}>
        <div className="-mx-4 divide-y divide-line-soft">
          {people.map((person) => (
            <PersonRow
              key={person.userId}
              name={person.name}
              src={person.photoUrl}
              subtitle={`${t('adminStats.invitedCount')}: ${person.connectionCount}`}
              value={person.remainingBudget != null ? formatMoney(Math.round(person.remainingBudget)) : undefined}
              onClick={() => open(person.userId)}
            />
          ))}
        </div>
      </Sheet>
    </section>
  );
}
