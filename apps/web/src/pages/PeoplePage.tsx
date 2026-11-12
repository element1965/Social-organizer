import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { cn } from '../lib/utils';
import { useCachedNetworkStats } from '../hooks/useCachedNetworkStats';
import { Button } from '../components/ui2/Button';
import { Chip } from '../components/ui2/Chip';
import { Group, Row } from '../components/ui2/Group';
import { Input } from '../components/ui2/Input';
import { PersonRow } from '../components/ui2/PersonRow';
import { Screen } from '../components/ui2/Screen';
import { Segmented } from '../components/ui2/Segmented';
import { formatMoney } from '../components/ui2/format';
import { AcquaintSheet, type AcquaintRequest } from '../components/circle/AcquaintSheet';
import { useCircleStore, type Ring } from '../components/circle/circle-store';
import { useCircleNetwork } from '../components/circle/network';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** List order. "brought" exists only for the 1st handshake, where we know whom each person added. */
type SortKey = 'recent' | 'name' | 'intention' | 'brought';
const SORT_KEY = 'so.people.sort';

function readSort(): SortKey {
  try {
    const value = localStorage.getItem(SORT_KEY);
    if (value === 'name' || value === 'intention' || value === 'brought') return value;
  } catch {
    // Storage blocked (private mode): fall back to the default order.
  }
  return 'recent';
}

function saveSort(value: SortKey) {
  try {
    localStorage.setItem(SORT_KEY, value);
  } catch {
    // Not saved; the order still applies for this visit.
  }
}

type Entry = {
  id: string;
  name: string;
  subtitle: string;
  photoUrl: string | null;
  at: number;
  /** Their intention this period, for sorting (0 when not set). */
  intention: number;
  /** People they added besides you (1st handshake only). */
  brought: number;
  /** Incoming request: opens the acquaintance sheet instead of the Person screen. */
  pendingId?: string;
};

type DepthUser = {
  id: string;
  name: string;
  photoUrl: string | null;
  connectedAt: string | Date | null;
  createdAt: string | Date | null;
  remainingBudget?: number | null;
};

function parseRing(value: string | undefined): Ring {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

/** People of one ring with search and the "show on graph" switch (screens.md §2). */
export function PeoplePage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const params = useParams();
  const ring = parseRing(params.ring);
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>(readSort);
  // "Brought in" is unknown beyond the 1st handshake: those lists use the default order
  const sort: SortKey = sortBy === 'brought' && ring !== 1 ? 'recent' : sortBy;
  const chooseSort = (value: SortKey) => {
    setSortBy(value);
    saveSort(value);
  };
  const [acquaint, setAcquaint] = useState<AcquaintRequest | null>(null);

  const net = useCircleNetwork();
  const stats = useCachedNetworkStats();
  const incoming = trpc.pending.incoming.useQuery(undefined, { enabled: ring === 1 });
  const hiddenRings = useCircleStore((s) => s.hiddenRings);
  const setRingHidden = useCircleStore((s) => s.setRingHidden);
  const visible = !hiddenRings.includes(ring);

  // All three rings at once: the list shows the active one, the search also looks through the others
  const byRing = useMemo<Record<Ring, Entry[]>>(() => {
    // What a person brings to the network: their intention this period (the sum "Declared participation" adds up).
    const pledged = (budget: number | null | undefined) =>
      budget != null && budget > 0 ? t('people.pledged', { amount: formatMoney(Math.round(budget)) }) : null;
    const first: Entry[] = (net.connections.data ?? []).map((c) => {
        const others = Math.max(0, c.connectionCount - 1);
        const parts: string[] = [];
        if (c.nickname && c.nickname !== c.name) parts.push(c.name);
        // People they connected besides you: how many they brought into the network
        parts.push(others > 0 ? t('people.brought', { count: others }) : t('people.noneYet'));
        const pledge = pledged(c.remainingBudget);
        if (pledge) parts.push(pledge);
        return {
          id: c.userId,
          name: c.displayName,
          subtitle: parts.join(' · '),
          photoUrl: c.photoUrl,
          at: new Date(c.createdAt).getTime(),
          intention: c.remainingBudget ?? 0,
          brought: others,
        };
      });
    const usersByDepth = (stats.data as { usersByDepth?: Record<number, DepthUser[]> } | undefined)?.usersByDepth ?? {};
    const deeper = (r: 2 | 3): Entry[] =>
      (usersByDepth[r] ?? []).map((u) => {
        const via = net.viaNames(u.id);
        return {
          id: u.id,
          name: net.displayName(u.id, u.name),
          subtitle: [via.length ? t('people.via', { path: via.join(' → ') }) : t(`circle.rings.full${r}`), pledged(u.remainingBudget)]
            .filter(Boolean)
            .join(' · '),
          photoUrl: u.photoUrl,
          at: new Date(u.connectedAt ?? u.createdAt ?? 0).getTime(),
          intention: u.remainingBudget ?? 0,
          brought: 0,
        };
      });
    return { 1: first, 2: deeper(2), 3: deeper(3) };
  }, [net, stats.data, t]);
  const entries = byRing[ring];

  const sortList = useMemo(() => {
    const collator = new Intl.Collator(i18n.language, { sensitivity: 'base' });
    const byName = (a: Entry, b: Entry) => collator.compare(a.name, b.name);
    const order: Record<SortKey, (a: Entry, b: Entry) => number> = {
      recent: (a, b) => b.at - a.at,
      name: byName,
      intention: (a, b) => b.intention - a.intention || byName(a, b),
      brought: (a, b) => b.brought - a.brought || byName(a, b),
    };
    return (list: Entry[], key: SortKey) => [...list].sort(order[key]);
  }, [i18n.language]);
  const sorted = useMemo(() => sortList(entries, sort), [sortList, entries, sort]);
  const needle = query.trim().toLocaleLowerCase();
  const filtered = needle
    ? sorted.filter((e) => e.name.toLocaleLowerCase().includes(needle) || e.subtitle.toLocaleLowerCase().includes(needle))
    : sorted;
  // Matches in the other rings, by name only ("through Oleg" would list half of a ring)
  const elsewhere = needle
    ? (([1, 2, 3] as Ring[])
        .filter((r) => r !== ring)
        .map((r) => ({
          ring: r,
          list: sortList(
            byRing[r].filter((e) => e.name.toLocaleLowerCase().includes(needle)),
            sortBy === 'brought' && r !== 1 ? 'recent' : sortBy,
          ),
        }))
        .filter((group) => group.list.length > 0))
    : [];

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
            intention: 0,
            brought: 0,
            pendingId: p.id,
          }))
      : [];

  const now = Date.now();
  // The "Recent" block belongs to the default order only; another order shows one list
  const splitRecent = ring === 1 && sort === 'recent';
  const recent = splitRecent ? filtered.filter((e) => now - e.at < WEEK_MS) : [];
  const rest = splitRecent ? filtered.filter((e) => now - e.at >= WEEK_MS) : filtered;
  const loading = ring === 1 ? net.connections.isLoading : stats.isLoading && !stats.data;
  const total = entries.length;
  // A failed list is not an empty one (no connection, server trouble)
  const failed = ring === 1 ? net.connections.isError && !net.connections.data : stats.isError && !stats.data;

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

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'recent', label: t('people.sortRecent') },
    { value: 'name', label: t('people.sortName') },
    { value: 'intention', label: t('people.sortIntention') },
    ...(ring === 1 ? [{ value: 'brought' as const, label: t('people.sortBrought') }] : []),
  ];

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
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('people.sort')}>
          <span className="shrink-0 text-micro font-bold text-ink-muted">{t('people.sort')}</span>
          {sortOptions.map((option) => (
            <Chip
              key={option.value}
              variant="action"
              active={sort === option.value}
              aria-pressed={sort === option.value}
              className="shrink-0"
              onClick={() => chooseSort(option.value)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
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
      ) : failed ? (
        <div className="mt-8 text-center">
          <p className="text-body-s font-semibold text-ink-muted">{t('common.error')}</p>
          <Button variant="secondary" size="md" className="mt-3" onClick={() => void (ring === 1 ? net.connections.refetch() : stats.refetch())}>
            {t('common.retry')}
          </Button>
        </div>
      ) : filtered.length === 0 && requests.length === 0 ? (
        <p className={cn('text-center text-body-s font-semibold text-ink-muted', elsewhere.length ? 'mt-4' : 'mt-8')}>
          {needle ? t(elsewhere.length ? 'people.foundElsewhere' : 'people.notFound') : t('people.empty')}
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
      {/* The search covers every handshake: matches from the other rings follow, each under its ring */}
      {!loading && elsewhere.length > 0 ? (
        <section className="mt-5" aria-label={t('people.alsoElsewhere')}>
          {filtered.length + requests.length > 0 ? (
            <p className="mb-1 px-1 text-micro font-bold text-ink-muted">{t('people.alsoElsewhere')}</p>
          ) : null}
          {elsewhere.map((group) => (
            <Group
              key={group.ring}
              title={t('people.title', { ring: t(`circle.rings.full${group.ring}`), count: group.list.length })}
              className="mt-3 first:mt-0"
            >
              {rows(group.list)}
            </Group>
          ))}
        </section>
      ) : null}
      <AcquaintSheet request={acquaint} onClose={() => setAcquaint(null)} />
    </Screen>
  );
}
