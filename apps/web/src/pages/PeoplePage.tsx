import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { Group, Row } from '../components/ui2/Group';
import { Input } from '../components/ui2/Input';
import { PersonRow } from '../components/ui2/PersonRow';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { AcquaintSheet, type AcquaintRequest } from '../components/circle/AcquaintSheet';
import { useCircleStore, type Ring } from '../components/circle/circle-store';
import { useCircleNetwork } from '../components/circle/network';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

type Entry = {
  id: string;
  name: string;
  subtitle: string;
  photoUrl: string | null;
  at: number;
  /** Incoming request: opens the acquaintance sheet instead of the Person screen. */
  pendingId?: string;
};

type DepthUser = {
  id: string;
  name: string;
  photoUrl: string | null;
  connectedAt: string | Date | null;
  createdAt: string | Date | null;
};

function parseRing(value: string | undefined): Ring {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

/** People of one ring with search and the "show on graph" switch (screens.md §2). */
export function PeoplePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const ring = parseRing(params.ring);
  const [query, setQuery] = useState('');
  const [acquaint, setAcquaint] = useState<AcquaintRequest | null>(null);

  const net = useCircleNetwork();
  const stats = useCachedNetworkStats();
  const incoming = trpc.pending.incoming.useQuery(undefined, { enabled: ring === 1 });
  const hiddenRings = useCircleStore((s) => s.hiddenRings);
  const setRingHidden = useCircleStore((s) => s.setRingHidden);
  const visible = !hiddenRings.includes(ring);

  const entries = useMemo<Entry[]>(() => {
    if (ring === 1) {
      return (net.connections.data ?? []).map((c) => {
        const others = Math.max(0, c.connectionCount - 1);
        const parts: string[] = [];
        if (c.nickname && c.nickname !== c.name) parts.push(c.name);
        parts.push(others > 0 ? t('people.inCircle', { count: others }) : t('people.noneYet'));
        return {
          id: c.userId,
          name: c.displayName,
          subtitle: parts.join(' · '),
          photoUrl: c.photoUrl,
          at: new Date(c.createdAt).getTime(),
        };
      });
    }
    const usersByDepth = (stats.data as { usersByDepth?: Record<number, DepthUser[]> } | undefined)?.usersByDepth ?? {};
    return (usersByDepth[ring] ?? []).map((u) => {
      const via = net.viaNames(u.id);
      return {
        id: u.id,
        name: net.displayName(u.id, u.name),
        subtitle: via.length ? t('people.via', { path: via.join(' → ') }) : t(`circle.rings.full${ring}`),
        photoUrl: u.photoUrl,
        at: new Date(u.connectedAt ?? u.createdAt ?? 0).getTime(),
      };
    });
  }, [ring, net, stats.data, t]);

  const sorted = useMemo(() => [...entries].sort((a, b) => b.at - a.at), [entries]);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? sorted.filter((e) => e.name.toLocaleLowerCase().includes(needle) || e.subtitle.toLocaleLowerCase().includes(needle))
    : sorted;

  const requests: Entry[] =
    ring === 1
      ? (incoming.data ?? [])
          .filter((p) => !needle || p.fromUser.name.toLocaleLowerCase().includes(needle))
          .map((p) => ({
            id: p.fromUser.id,
            name: p.fromUser.name,
            subtitle: t('people.confirm'),
            photoUrl: p.fromUser.photoUrl,
            at: new Date(p.createdAt).getTime(),
            pendingId: p.id,
          }))
      : [];

  const now = Date.now();
  const recent = ring === 1 ? filtered.filter((e) => now - e.at < WEEK_MS) : [];
  const rest = ring === 1 ? filtered.filter((e) => now - e.at >= WEEK_MS) : filtered;
  const loading = ring === 1 ? net.connections.isLoading : stats.isLoading && !stats.data;
  const total = entries.length;

  const open = (entry: Entry) => {
    if (entry.pendingId) {
      setAcquaint({ pendingId: entry.pendingId, personId: entry.id, name: entry.name });
      return;
    }
    navigate(`/person/${entry.id}`);
  };

  const rows = (list: Entry[]) =>
    list.map((entry) => (
      <PersonRow
        key={`${entry.pendingId ?? 'p'}:${entry.id}`}
        name={entry.name}
        subtitle={entry.subtitle}
        src={entry.photoUrl}
        onClick={() => open(entry)}
      />
    ));

  const ringOptions = ([1, 2, 3] as Ring[]).map((r) => ({ value: String(r) as '1' | '2' | '3', label: t(`circle.rings.short${r}`) }));

  return (
    <Screen
      title={t('people.title', { ring: t(`circle.rings.full${ring}`), count: total })}
      back={{ label: t('nav.circle'), to: '/' }}
      width="column"
    >
      <div className="flex flex-col gap-2.5 pt-2">
        <Segmented
          label={t('people.ring')}
          value={String(ring) as '1' | '2' | '3'}
          onChange={(value) => navigate(`/people/${value}`, { replace: true })}
          options={ringOptions}
        />
        <Input
          variant="search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('people.search')}
          aria-label={t('people.search')}
        />
        <Group>
          <Row
            variant="toggle"
            title={t('people.showOnGraph', { count: total })}
            subtitle={t('people.showOnGraphHint')}
            checked={visible}
            onCheckedChange={(checked) => setRingHidden(ring, !checked)}
          />
        </Group>
      </div>

      {loading ? (
        <div className="mt-4 flex flex-col gap-2" aria-busy>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
          ))}
        </div>
      ) : filtered.length === 0 && requests.length === 0 ? (
        <p className="mt-8 text-center text-body-s font-semibold text-ink-muted">
          {needle ? t('people.notFound') : t('people.empty')}
        </p>
      ) : (
        <>
          {requests.length + recent.length > 0 ? (
            <Group title={t('people.recent')}>{rows([...requests, ...recent])}</Group>
          ) : null}
          {rest.length > 0 ? (
            <Group title={ring === 1 && requests.length + recent.length > 0 ? t('people.all', { count: rest.length }) : undefined} className="mt-3">
              {rows(rest)}
            </Group>
          ) : null}
        </>
      )}
      <AcquaintSheet request={acquaint} onClose={() => setAcquaint(null)} />
    </Screen>
  );
}
