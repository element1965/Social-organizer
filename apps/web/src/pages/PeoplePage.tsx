import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { keepPreviousData } from '@tanstack/react-query';
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
import { NETWORK_STALE_MS, useCircleNetwork } from '../components/circle/network';

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
  /** Their intention, shown at the row end ("15 $"); null when not set. */
  value: string | null;
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
  /** People between me and them, from the server (absent in the saved network numbers) */
  via?: Array<{ id: string; name: string }>;
};

function parseRing(value: string | undefined): Ring {
  return value === '2' ? 2 : value === '3' ? 3 : 1;
}

/** People read per page on the 2nd and 3rd handshake ("Show more" reads the next page). */
const RING_PAGE = 50;
/** The server search waits until typing pauses. */
const SEARCH_DELAY_MS = 300;

function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * The people of the 2nd or 3rd handshake, complete, page by page: ordered and searched on the server.
 * `sort` is never "brought" here (unknown beyond the 1st handshake).
 */
function useRingPeople(ring: 2 | 3, search: string, sort: Exclude<SortKey, 'brought'>, enabled: boolean) {
  return trpc.connection.ringPeople.useInfiniteQuery(
    { ring, limit: RING_PAGE, search: search || undefined, sort },
    {
      enabled,
      getNextPageParam: (last) => last.nextCursor ?? undefined,
      staleTime: NETWORK_STALE_MS,
      // While a new search or order loads, the rows already shown stay (filtered on the device meanwhile)
      placeholderData: keepPreviousData,
    },
  );
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

  const needle = query.trim().toLocaleLowerCase();
  const serverSearch = useDebounced(query.trim(), SEARCH_DELAY_MS);
  // The 2nd and 3rd handshake come from the server page by page; the other ring is read only for a search
  const deepSort: Exclude<SortKey, 'brought'> = sortBy === 'brought' ? 'recent' : sortBy;
  const ring2 = useRingPeople(2, serverSearch, deepSort, ring === 2 || serverSearch !== '');
  const ring3 = useRingPeople(3, serverSearch, deepSort, ring === 3 || serverSearch !== '');

  // The network numbers are re-read on a timer and when my connections change: the lists follow them,
  // but only when the rings really changed (a re-read with the same numbers would fetch every page again)
  const utils = trpc.useUtils();
  const ringsKey = stats.data ? JSON.stringify(stats.data.byDepth) : '';
  const lastRingsKey = useRef(ringsKey);
  useEffect(() => {
    if (lastRingsKey.current && ringsKey && ringsKey !== lastRingsKey.current) void utils.connection.ringPeople.invalidate();
    if (ringsKey) lastRingsKey.current = ringsKey;
  }, [ringsKey, utils]);

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

  // What a person brings to the network: their intention this period (the sum "Declared participation" adds up).
  // Shown at the row end, so a long chain of acquaintances keeps the subtitle to itself
  const pledged = (budget: number | null | undefined) => (budget != null && budget > 0 ? formatMoney(Math.round(budget)) : null);

  const first = useMemo<Entry[]>(
    () =>
      (net.connections.data ?? []).map((c) => {
        const others = Math.max(0, c.connectionCount - 1);
        const parts: string[] = [];
        if (c.nickname && c.nickname !== c.name) parts.push(c.name);
        // People they connected besides you: how many they brought into the network
        parts.push(others > 0 ? t('people.brought', { count: others }) : t('people.noneYet'));
        return {
          id: c.userId,
          name: c.displayName,
          subtitle: parts.join(' · '),
          value: pledged(c.remainingBudget),
          photoUrl: c.photoUrl,
          at: new Date(c.createdAt).getTime(),
          intention: c.remainingBudget ?? 0,
          brought: others,
        };
      }),
    [net.connections.data, t], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const deepEntry = (r: 2 | 3, u: DepthUser): Entry => {
    // The path from the server names everyone on it; my nicknames replace the names of my own connections
    const via = u.via ? u.via.map((p) => net.displayName(p.id, p.name)) : net.viaNames(u.id);
    return {
      id: u.id,
      name: net.displayName(u.id, u.name),
      subtitle: via.length ? t('people.via', { path: via.join(' → ') }) : t(`circle.rings.full${r}`),
      value: pledged(u.remainingBudget),
      photoUrl: u.photoUrl,
      at: new Date(u.connectedAt ?? u.createdAt ?? 0).getTime(),
      intention: u.remainingBudget ?? 0,
      brought: 0,
    };
  };

  /** One ring as the screen shows it: ordered, filtered by the search, with what is left to read. */
  type RingList = {
    list: Entry[];
    /** People in the ring, or the matches of the search */
    total: number;
    left: number;
    loading: boolean;
    failed: boolean;
    fetchingMore: boolean;
    more: () => void;
    retry: () => void;
  };
  // Matches by name; in the open ring also by the subtitle ("through Oleg"), as far as the rows on the device go
  const matches = (e: Entry, r: Ring) =>
    !needle || e.name.toLocaleLowerCase().includes(needle) || (r === ring && e.subtitle.toLocaleLowerCase().includes(needle));
  const nothing = () => undefined;

  const firstList: RingList = {
    list: sortList(first, sortBy).filter((e) => matches(e, 1)),
    total: first.length,
    left: 0,
    loading: net.connections.isLoading,
    failed: net.connections.isError && !net.connections.data,
    fetchingMore: false,
    more: nothing,
    retry: () => void net.connections.refetch(),
  };

  const deepList = (r: 2 | 3, q: typeof ring2): RingList => {
    const pages = q.data?.pages;
    if (pages) {
      const seen = new Set<string>();
      const list: Entry[] = [];
      for (const page of pages) {
        for (const u of page.people) {
          if (seen.has(u.id)) continue;
          seen.add(u.id);
          list.push(deepEntry(r, u));
        }
      }
      const total = pages[pages.length - 1]!.total;
      return {
        // Already in order and searched on the server; the device narrows it while a new search loads
        list: list.filter((e) => matches(e, r)),
        total,
        left: q.hasNextPage ? Math.max(0, total - list.length) : 0,
        loading: false,
        failed: false,
        fetchingMore: q.isFetchingNextPage,
        more: () => void q.fetchNextPage(),
        retry: () => void q.refetch(),
      };
    }
    // No answer (offline, server trouble): the people kept with the saved network numbers, as before paging
    const saved = (stats.data as { usersByDepth?: Record<number, DepthUser[]> } | undefined)?.usersByDepth?.[r];
    if (q.isError && saved) {
      const list = saved.map((u) => deepEntry(r, u));
      return {
        list: sortList(list, deepSort).filter((e) => matches(e, r)),
        total: list.length,
        left: 0,
        loading: false,
        failed: false,
        fetchingMore: false,
        more: nothing,
        retry: () => void q.refetch(),
      };
    }
    return {
      list: [],
      total: 0,
      left: 0,
      loading: q.isLoading,
      failed: q.isError,
      fetchingMore: false,
      more: nothing,
      retry: () => void q.refetch(),
    };
  };

  const lists: Record<Ring, RingList> = { 1: firstList, 2: deepList(2, ring2), 3: deepList(3, ring3) };
  const current = lists[ring];
  const filtered = current.list;
  // Matches in the other rings, by name only ("through Oleg" would list half of a ring)
  const elsewhere = needle
    ? (([1, 2, 3] as Ring[])
        .filter((r) => r !== ring)
        .map((r) => ({ ring: r, ...lists[r] }))
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
            value: null,
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
  const loading = current.loading;
  // The whole ring: the exact count from the network numbers while a search narrows the list
  const statsCount = (stats.data as { byDepth?: Record<number, number> } | undefined)?.byDepth?.[ring];
  const total = ring === 1 || (!serverSearch && !current.loading && !current.failed) ? current.total : (statsCount ?? current.total);
  // A failed list is not an empty one (no connection, server trouble)
  const failed = current.failed;

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
        subtitleLines={2}
        value={entry.value ?? undefined}
        valueCaption={entry.value ? t('people.sortIntention') : undefined}
        src={entry.photoUrl}
        onClick={() => open(entry)}
      />
    ));

  // The next page of a ring read from the server (the 2nd and 3rd handshake can hold thousands)
  const showMore = (list: RingList) =>
    list.left > 0 ? (
      <Button variant="secondary" className="mt-3 w-full" disabled={list.fetchingMore} onClick={list.more}>
        {t('add.showMore', { total: list.left })}
      </Button>
    ) : null;

  const sortOptions: { value: SortKey; label: string }[] = [
    { value: 'recent', label: t('people.sortRecent') },
    { value: 'name', label: t('people.sortName') },
    { value: 'intention', label: t('people.sortIntention') },
    ...(ring === 1 ? [{ value: 'brought' as const, label: t('people.sortBrought') }] : []),
  ];

  // A horizontal swipe anywhere on the list switches the handshake, like the tabs above it.
  // Touches near the screen edges are left to the system back gesture.
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const goRing = (next: number) => {
    if (next >= 1 && next <= 3 && next !== ring) navigate(`/people/${next}`, { replace: true });
  };
  const onTouchStart = (event: TouchEvent) => {
    const touch = event.touches[0];
    const edge = 24;
    swipe.current =
      touch && event.touches.length === 1 && touch.clientX > edge && touch.clientX < window.innerWidth - edge
        ? { x: touch.clientX, y: touch.clientY }
        : null;
  };
  const onTouchEnd = (event: TouchEvent) => {
    const start = swipe.current;
    swipe.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Mostly sideways and long enough, so a vertical scroll never flips the ring
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const rtl = document.documentElement.dir === 'rtl';
    const forward = rtl ? dx > 0 : dx < 0;
    goRing(ring + (forward ? 1 : -1));
  };

  // The list slides in from the side of the tab it came from (mirrored in right-to-left languages)
  const lastRing = useRef(ring);
  const slide = useRef<'so-slide-next' | 'so-slide-prev' | 'so-fade-in'>('so-fade-in');
  if (lastRing.current !== ring) {
    const forward = ring > lastRing.current;
    const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
    slide.current = forward !== rtl ? 'so-slide-next' : 'so-slide-prev';
    lastRing.current = ring;
  }

  const ringOptions = ([1, 2, 3] as Ring[]).map((r) => ({ value: String(r) as '1' | '2' | '3', label: t(`circle.rings.short${r}`) }));

  return (
    <Screen
      title={t('people.title', { ring: t(`circle.rings.full${ring}`), count: total })}
      back={{ label: t('nav.circle'), to: '/' }}
      width="column"
    >
      <div className="min-h-[70dvh]" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd} onTouchCancel={() => (swipe.current = null)}>
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

        <div key={ring} className={slide.current}>
          {loading ? (
            <div className="mt-4 flex flex-col gap-2" aria-busy>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-lg bg-surface motion-reduce:animate-none" />
              ))}
            </div>
          ) : failed ? (
            <div className="mt-8 text-center">
              <p className="text-body-s font-semibold text-ink-muted">{t('common.error')}</p>
              <Button variant="secondary" size="md" className="mt-3" onClick={current.retry}>
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
                <Group title={t('people.recent')} stagger>{rows([...requests, ...recent])}</Group>
              ) : null}
              {rest.length > 0 ? (
                <Group title={ring === 1 && requests.length + recent.length > 0 ? t('people.all', { count: rest.length }) : undefined} className="mt-3" stagger>
                  {rows(rest)}
                </Group>
              ) : null}
              {showMore(current)}
            </>
          )}
          {/* The search covers every handshake: matches from the other rings follow, each under its ring */}
          {!loading && elsewhere.length > 0 ? (
            <section className="mt-5" aria-label={t('people.alsoElsewhere')}>
              {filtered.length + requests.length > 0 ? (
                <p className="mb-1 px-1 text-micro font-bold text-ink-muted">{t('people.alsoElsewhere')}</p>
              ) : null}
              {elsewhere.map((group) => (
                <div key={group.ring} className="mt-3 first:mt-0">
                  <Group
                    title={t('people.title', {
                      ring: t(`circle.rings.full${group.ring}`),
                      count: group.left > 0 ? group.total : group.list.length,
                    })}
                    stagger
                  >
                    {rows(group.list)}
                  </Group>
                  {showMore(group)}
                </div>
              ))}
            </section>
          ) : null}
        </div>
      </div>
      <AcquaintSheet request={acquaint} onClose={() => setAcquaint(null)} />
    </Screen>
  );
}
