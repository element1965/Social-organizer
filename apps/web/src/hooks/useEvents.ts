import { useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';
import { formatMoney } from '../components/ui2/format';

const DAY_MS = 24 * 60 * 60 * 1000;
const POLL_MS = 20_000;

export type FeedKind =
  | 'request'
  | 'mine'
  | 'participating'
  | 'cycle'
  | 'closed'
  | 'blocked'
  | 'joined'
  | 'incoming'
  | 'waiting'
  | 'milestone';

export type MilestoneKind = 'FIRST_CONNECTION' | 'TEN_CONNECTIONS';

export type FeedEvent = {
  id: string;
  kind: FeedKind;
  at: number;
  title: string;
  subtitle: string;
  amount?: string;
  /** Raw goal of a request, for the person card ("Collection 80 $"). */
  amountValue?: number | null;
  /** Needs the viewer: shown with the care accent. */
  hot: boolean;
  personId?: string;
  collectionId?: string;
  notificationId?: string;
  pendingId?: string;
  milestone?: MilestoneKind;
};

type Person = { id: string; name: string };

// Loose shapes: notification.list returns Prisma rows plus resolved paths.
type NotificationItem = {
  id: string;
  type: string;
  status: string;
  wave?: number | null;
  createdAt: string | Date;
  collectionId: string;
  handshakePath?: unknown;
  handshakePathResolved?: Person[];
  collection: {
    id: string;
    type: string;
    status: string;
    amount: number | null;
    cycleNumber: number | null;
    currentCycleStart: string | Date | null;
    creatorId: string;
    creator: { id: string; name: string; photoUrl: string | null };
    obligations?: Array<{ amount: number }>;
  } | null;
};

const REQUEST_TYPES = new Set(['NEW_COLLECTION', 'RE_NOTIFY', 'SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER']);

/** Last day of the cycle a regular-cycle notification refers to. */
function cycleEnd(n: NotificationItem): Date | null {
  const c = n.collection;
  if (!c?.currentCycleStart || c.cycleNumber == null) return null;
  const current = new Date(c.currentCycleStart).getTime();
  const target = n.type === 'CYCLE_RENEWAL_REMINDER' ? (n.wave ?? c.cycleNumber) + 1 : (n.wave ?? c.cycleNumber);
  const start = current + (target - c.cycleNumber) * REGULAR_CYCLE_DAYS * DAY_MS;
  return new Date(start + (REGULAR_CYCLE_DAYS - 1) * DAY_MS);
}

/**
 * The Circle feed: unread notifications, incoming and outgoing acquaintance requests,
 * collections I take part in, my own open requests and fresh milestones — one list, newest first.
 * Polls the unread counter so new events arrive without a reload.
 */
export function useEvents(options: { displayName?: (id: string, fallback: string) => string } = {}) {
  const { t, i18n } = useTranslation();
  const myId = useAuth((s) => s.userId);
  const utils = trpc.useUtils();
  const name = options.displayName ?? ((_id: string, fallback: string) => fallback);

  const unread = trpc.notification.unreadCount.useQuery(undefined, { refetchInterval: POLL_MS });
  const notifications = trpc.notification.list.useQuery({ limit: 30 }, { refetchInterval: 60_000 });
  const incoming = trpc.pending.incoming.useQuery(undefined, { refetchInterval: POLL_MS });
  const outgoing = trpc.pending.myPending.useQuery(undefined, { refetchInterval: 60_000 });
  const participating = trpc.collection.myParticipating.useQuery(undefined, { refetchInterval: 60_000 });
  const mine = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 60_000 });
  const milestones = trpc.milestone.list.useQuery(undefined, { refetchInterval: 60_000 });

  // A changed unread counter means new notifications: refresh the list right away.
  const lastCount = useRef<number | null>(null);
  useEffect(() => {
    const count = unread.data?.count;
    if (count == null) return;
    if (lastCount.current != null && count !== lastCount.current) {
      void utils.notification.list.invalidate();
    }
    lastCount.current = count;
  }, [unread.data?.count, utils]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }),
    [i18n.language],
  );

  const events = useMemo<FeedEvent[]>(() => {
    const out: FeedEvent[] = [];
    const seenCollections = new Set<string>();
    const items = (notifications.data?.items ?? []) as unknown as NotificationItem[];

    for (const n of items) {
      if (n.status !== 'UNREAD' || !n.collection) continue;
      const c = n.collection;
      const creator = name(c.creator.id, c.creator.name);
      const at = new Date(n.createdAt).getTime();
      const base = { id: `n:${n.id}`, at, notificationId: n.id, collectionId: c.id, personId: c.creator.id };

      if (REQUEST_TYPES.has(n.type)) {
        if (c.status !== 'ACTIVE' || seenCollections.has(c.id)) continue;
        seenCollections.add(c.id);
        const path = n.handshakePathResolved ?? [];
        // Path runs from the author to me: the person next to me is the one I know.
        const near = path.length > 2 ? path[path.length - 2] : undefined;
        const kind = c.type === 'REGULAR' ? t('circle.feed.every') : t('circle.feed.once');
        out.push({
          ...base,
          kind: 'request',
          title: creator,
          subtitle: near
            ? t('circle.feed.requestVia', { name: name(near.id, near.name), kind })
            : t('circle.feed.request', { kind }),
          amount: c.amount != null ? formatMoney(c.amount) : undefined,
          amountValue: c.amount,
          hot: true,
        });
        continue;
      }

      if (n.type === 'CYCLE_RENEWED' || n.type === 'CYCLE_RENEWAL_REMINDER') {
        const end = cycleEnd(n);
        const total = (c.obligations ?? []).reduce((sum, o) => sum + o.amount, 0);
        const date = end ? dateFmt.format(end) : '';
        seenCollections.add(c.id);
        out.push({
          ...base,
          kind: 'cycle',
          title: creator,
          subtitle:
            total > 0
              ? t('circle.feed.cycleWithAmount', { amount: formatMoney(total), date })
              : t('circle.feed.cycle', { date }),
          hot: n.type === 'CYCLE_RENEWED',
        });
        continue;
      }

      if (n.type === 'COLLECTION_CLOSED') {
        seenCollections.add(c.id);
        out.push({ ...base, kind: 'closed', title: creator, subtitle: t('circle.feed.closed'), hot: false });
        continue;
      }
      if (n.type === 'COLLECTION_BLOCKED') {
        seenCollections.add(c.id);
        out.push({ ...base, kind: 'blocked', title: creator, subtitle: t('circle.feed.blocked'), hot: false });
        continue;
      }
      if (n.type === 'NEW_OBLIGATION') {
        out.push({ ...base, kind: 'joined', title: t('circle.feed.joinedTitle'), subtitle: t('circle.feed.joined'), hot: false });
      }
    }

    for (const p of incoming.data ?? []) {
      out.push({
        id: `in:${p.id}`,
        kind: 'incoming',
        at: new Date(p.createdAt).getTime(),
        title: name(p.fromUser.id, p.fromUser.name),
        subtitle: t('circle.feed.incoming'),
        hot: true,
        personId: p.fromUser.id,
        pendingId: p.id,
      });
    }

    for (const p of outgoing.data ?? []) {
      out.push({
        id: `out:${p.id}`,
        kind: 'waiting',
        at: new Date(p.createdAt).getTime(),
        title: name(p.toUser.id, p.toUser.name),
        subtitle: t('circle.feed.waiting'),
        hot: false,
        personId: p.toUser.id,
      });
    }

    for (const col of mine.data ?? []) {
      if (col.status !== 'ACTIVE') continue;
      seenCollections.add(col.id);
      out.push({
        id: `mine:${col.id}`,
        kind: 'mine',
        at: new Date(col.createdAt).getTime(),
        title: t('circle.feed.mineTitle'),
        subtitle:
          col.amount != null
            ? t('circle.feed.mineProgress', { collected: formatMoney(col.currentAmount), goal: formatMoney(col.amount) })
            : t('circle.feed.mineCollected', { collected: formatMoney(col.currentAmount) }),
        hot: false,
        collectionId: col.id,
      });
    }

    // One row per collection I take part in, unless a fresher event already covers it.
    const byCollection = new Map<string, { amount: number; at: number; creator: Person; id: string }>();
    for (const o of participating.data ?? []) {
      const c = o.collection;
      if (!c || c.status !== 'ACTIVE' || o.unsubscribedAt || c.creatorId === myId) continue;
      const prev = byCollection.get(c.id);
      byCollection.set(c.id, {
        id: c.id,
        amount: (prev?.amount ?? 0) + o.amount,
        at: Math.max(prev?.at ?? 0, new Date(o.createdAt).getTime()),
        creator: c.creator,
      });
    }
    for (const row of byCollection.values()) {
      if (seenCollections.has(row.id)) continue;
      out.push({
        id: `part:${row.id}`,
        kind: 'participating',
        at: row.at,
        title: name(row.creator.id, row.creator.name),
        subtitle: t('circle.feed.participating', { amount: formatMoney(row.amount) }),
        hot: false,
        collectionId: row.id,
        personId: row.creator.id,
      });
    }

    for (const m of milestones.data?.items ?? []) {
      if (!m.achievedAt || m.seen) continue;
      const kind = m.kind as MilestoneKind;
      out.push({
        id: `ms:${kind}`,
        kind: 'milestone',
        at: new Date(m.achievedAt).getTime(),
        title: kind === 'FIRST_CONNECTION' ? t('circle.feed.milestoneFirst') : t('circle.feed.milestoneTen'),
        subtitle: m.person ? t('circle.feed.milestoneWith', { name: name(m.person.id, m.person.name) }) : t('circle.feed.milestoneGrow'),
        hot: true,
        milestone: kind,
        personId: m.person?.id,
      });
    }

    return out.sort((a, b) => b.at - a.at);
  }, [notifications.data, incoming.data, outgoing.data, mine.data, participating.data, milestones.data, myId, t, name, dateFmt]);

  const loading =
    notifications.isLoading ||
    incoming.isLoading ||
    outgoing.isLoading ||
    participating.isLoading ||
    mine.isLoading ||
    milestones.isLoading;

  return { events, loading, unreadCount: unread.data?.count ?? 0 };
}

/** Kinds that arrive from someone else and deserve the top banner. */
export const BANNER_KINDS: ReadonlySet<FeedKind> = new Set(['request', 'cycle', 'incoming', 'joined', 'closed', 'milestone']);

/**
 * Calls onNew with events that appeared after the first load (ids not seen before), newest first.
 * The first loaded list only seeds the memory, so opening the app never shows a banner.
 */
export function useNewEvents(events: FeedEvent[], ready: boolean, onNew: (fresh: FeedEvent[]) => void) {
  const seen = useRef<Set<string> | null>(null);
  const callback = useRef(onNew);
  callback.current = onNew;
  useEffect(() => {
    if (!ready) return;
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id));
      return;
    }
    const fresh = events.filter((e) => !seen.current!.has(e.id) && BANNER_KINDS.has(e.kind));
    for (const e of events) seen.current.add(e.id);
    if (fresh.length) callback.current(fresh);
  }, [events, ready]);
}
