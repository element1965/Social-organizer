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

export type MilestoneKind = 'FIRST_CONNECTION' | 'NEED_UNLOCKED' | 'FIRST_NEED' | 'FIRST_PARTICIPATION';

/** Locale keys of a milestone: its name (feed row, sheet title, Profile list), the feed subtitle and the sheet text. */
export const MILESTONE_KEYS: Record<MilestoneKind, { title: string; sub: string; body: string }> = {
  FIRST_CONNECTION: { title: 'circle.feed.milestoneFirst', sub: 'circle.feed.milestoneGrow', body: 'circle.milestone.firstBody' },
  NEED_UNLOCKED: { title: 'circle.feed.milestoneUnlocked', sub: 'circle.feed.milestoneUnlockedSub', body: 'circle.milestone.unlockedBody' },
  FIRST_NEED: { title: 'circle.feed.milestoneFirstNeed', sub: 'circle.feed.milestoneFirstNeedSub', body: 'circle.milestone.firstNeedBody' },
  FIRST_PARTICIPATION: { title: 'circle.feed.milestoneFirstPart', sub: 'circle.feed.milestoneFirstPartSub', body: 'circle.milestone.firstPartBody' },
};

export type FeedEvent = {
  id: string;
  kind: FeedKind;
  at: number;
  title: string;
  subtitle: string;
  /** What the author wrote the request is for (plain text), shown under the subtitle. */
  note?: string;
  amount?: string;
  /** Raw goal of a request, for the person card ("Collection 80 $"). */
  amountValue?: number | null;
  /** Needs the viewer: shown with the care accent. */
  hot: boolean;
  personId?: string;
  collectionId?: string;
  /** Every unread notification the row stands for: read or dismissed together. */
  notificationIds?: string[];
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
    description?: string | null;
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
  const notifications = trpc.notification.list.useQuery({ limit: 100 }, { refetchInterval: 60_000 });
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
    const items = (notifications.data?.items ?? []) as unknown as NotificationItem[];

    // Collections I already joined: their requests are handled, they show as "Discussion" rows.
    const joined = new Map<string, { amount: number; at: number; creator: Person; id: string; ids: string[] }>();
    for (const o of participating.data ?? []) {
      const c = o.collection;
      if (!c || c.status !== 'ACTIVE' || o.unsubscribedAt || c.creatorId === myId) continue;
      const prev = joined.get(c.id);
      joined.set(c.id, {
        id: c.id,
        amount: (prev?.amount ?? 0) + o.amount,
        at: Math.max(prev?.at ?? 0, new Date(o.createdAt).getTime()),
        creator: c.creator,
        ids: prev?.ids ?? [],
      });
    }

    // One row per collection and kind; every unread notification it collapses is carried along,
    // so opening or dismissing the row clears all of them. Items arrive newest first.
    const rows = new Map<string, FeedEvent>();
    const covered = new Set<string>();
    for (const n of items) {
      if (n.status !== 'UNREAD' || !n.collection) continue;
      const c = n.collection;
      const isRequest = REQUEST_TYPES.has(n.type);
      const isCycle = n.type === 'CYCLE_RENEWED' || n.type === 'CYCLE_RENEWAL_REMINDER';

      if (isRequest && joined.has(c.id)) {
        joined.get(c.id)!.ids.push(n.id);
        continue;
      }

      const group = isRequest ? 'request' : isCycle ? 'cycle' : n.type;
      const key = `${group}:${c.id}`;
      const existing = rows.get(key);
      if (existing) {
        existing.notificationIds!.push(n.id);
        continue;
      }

      const creator = name(c.creator.id, c.creator.name);
      const base = {
        id: `n:${key}`,
        at: new Date(n.createdAt).getTime(),
        notificationIds: [n.id],
        collectionId: c.id,
        personId: c.creator.id,
      };

      if (isRequest) {
        if (c.status !== 'ACTIVE') continue;
        const path = n.handshakePathResolved ?? [];
        // Path runs from the author to me: the person next to me is the one I know.
        const near = path.length > 2 ? path[path.length - 2] : undefined;
        const kind = c.type === 'REGULAR' ? t('circle.feed.every') : t('circle.feed.once');
        rows.set(key, {
          ...base,
          kind: 'request',
          title: creator,
          subtitle: near
            ? t('circle.feed.requestVia', { name: name(near.id, near.name), kind })
            : t('circle.feed.request', { kind }),
          note: c.description?.trim() || undefined,
          amount: c.amount != null ? formatMoney(c.amount) : undefined,
          amountValue: c.amount,
          hot: true,
        });
      } else if (isCycle) {
        const end = cycleEnd(n);
        const total = (c.obligations ?? []).reduce((sum, o) => sum + o.amount, 0);
        const date = end ? dateFmt.format(end) : '';
        rows.set(key, {
          ...base,
          kind: 'cycle',
          title: creator,
          subtitle:
            total > 0
              ? t('circle.feed.cycleWithAmount', { amount: formatMoney(total), date })
              : t('circle.feed.cycle', { date }),
          hot: n.type === 'CYCLE_RENEWED',
        });
      } else if (n.type === 'COLLECTION_CLOSED') {
        rows.set(key, { ...base, kind: 'closed', title: creator, subtitle: t('circle.feed.closed'), hot: false });
      } else if (n.type === 'COLLECTION_BLOCKED') {
        rows.set(key, { ...base, kind: 'blocked', title: creator, subtitle: t('circle.feed.blocked'), hot: false });
      } else if (n.type === 'NEW_OBLIGATION') {
        rows.set(key, { ...base, kind: 'joined', title: t('circle.feed.joinedTitle'), subtitle: t('circle.feed.joined'), hot: false });
      } else {
        continue;
      }
      covered.add(c.id);
    }
    out.push(...rows.values());

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
      covered.add(col.id);
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

    // One row per collection I take part in, unless a fresher event (cycle, closed) covers it.
    for (const row of joined.values()) {
      if (covered.has(row.id)) continue;
      out.push({
        id: `part:${row.id}`,
        kind: 'participating',
        at: row.at,
        title: name(row.creator.id, row.creator.name),
        subtitle: t('circle.feed.participating', { amount: formatMoney(row.amount) }),
        hot: false,
        collectionId: row.id,
        personId: row.creator.id,
        notificationIds: row.ids.length ? row.ids : undefined,
      });
    }

    for (const m of milestones.data?.items ?? []) {
      if (!m.achievedAt || m.seen) continue;
      const kind = m.kind as MilestoneKind;
      const keys = MILESTONE_KEYS[kind];
      if (!keys) continue;
      out.push({
        id: `ms:${kind}`,
        kind: 'milestone',
        at: new Date(m.achievedAt).getTime(),
        title: t(keys.title),
        subtitle: m.person ? t('circle.feed.milestoneWith', { name: name(m.person.id, m.person.name) }) : t(keys.sub),
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

/** Feed sections, in display order: what waits for me, my own Needs, Needs I take part in, people. */
export type FeedGroup = 'needs' | 'mine' | 'helping' | 'people';
export const FEED_GROUPS: readonly FeedGroup[] = ['needs', 'mine', 'helping', 'people'];

/**
 * The section a row belongs to. Status rows (new cycle, closed, paused) go with their Need: under "Your Needs"
 * when I am the author, under "You are in" otherwise.
 */
export function feedGroup(event: FeedEvent, myId: string | null | undefined): FeedGroup {
  switch (event.kind) {
    case 'request':
    case 'incoming':
      return 'needs';
    case 'mine':
    case 'joined':
      return 'mine';
    case 'participating':
      return 'helping';
    case 'cycle':
    case 'closed':
    case 'blocked':
      return myId && event.personId === myId ? 'mine' : 'helping';
    default:
      return 'people';
  }
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
