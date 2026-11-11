import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { trpc } from '../lib/trpc';
import { useAuth } from './useAuth';
import { useAcceptedRecent } from './useAcceptedRecent';
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
  | 'milestone'
  | 'accepted';

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
  /** The person on the row, for the avatars of a stacked card. */
  photoUrl?: string | null;
  collectionId?: string;
  /** Every unread notification the row stands for: read or dismissed together. */
  notificationIds?: string[];
  pendingId?: string;
  milestone?: MilestoneKind;
};

type Person = { id: string; name: string };

// Loose shapes: notification.list returns Prisma rows plus resolved paths.
export type NotificationItem = {
  id: string;
  type: string;
  status: string;
  wave?: number | null;
  createdAt: string | Date;
  expiresAt?: string | Date | null;
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

/**
 * A request notice that still waits for my decision: the Need is ACTIVE (not closed, cancelled, paused or at its
 * goal), the notice has not expired and it is UNREAD or READ. READ counts: opening the Need marks the notice read
 * (the API does it in collection.getById), which says "seen", not "decided". Joining the Need (an active
 * Participation) and dismissing the notice are the decisions; both are checked by the caller / the dismissal.
 */
export function isPendingRequest(n: NotificationItem, now: number): boolean {
  if (!REQUEST_TYPES.has(n.type)) return false;
  if (n.status !== 'UNREAD' && n.status !== 'READ') return false;
  if (n.collection?.status !== 'ACTIVE') return false;
  if (n.expiresAt != null && new Date(n.expiresAt).getTime() <= now) return false;
  return true;
}

/**
 * Re-renders the caller when the nearest pending request notice expires (a timer to its `expiresAt`), so an
 * impulse or a "Not now" button does not outlive its notice while the screen stays open: the query data keeps
 * its identity, so nothing else would recompute. Optionally only the notices of one Need.
 */
export function useExpiryTick(items: NotificationItem[] | undefined, collectionId?: string): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!items) return;
    const now = Date.now();
    let next = Infinity;
    for (const n of items) {
      if (collectionId && n.collectionId !== collectionId) continue;
      if (n.expiresAt == null || !isPendingRequest(n, now)) continue;
      next = Math.min(next, new Date(n.expiresAt).getTime());
    }
    if (!Number.isFinite(next)) return;
    // setTimeout caps at about 24.8 days; the notice TTL is a day, but stay safe
    const timer = window.setTimeout(() => setTick((x) => x + 1), Math.min(Math.max(next - now, 0) + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [items, collectionId, tick]);
  return tick;
}

/** An active incoming Need for the graph: the signal that travels from its author to me. */
export type ImpulseNeed = {
  /** The Need (collection) id */
  id: string;
  personId: string;
  at: number;
  /** Ids from the author to me, as the notice recorded them (may reach beyond the drawn rings) */
  path: string[];
};

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

  // The shell already re-reads the unread count every 30 s; a second timer here doubled the requests
  const unread = trpc.notification.unreadCount.useQuery();
  const notifications = trpc.notification.list.useQuery({ limit: 100 }, { refetchInterval: 60_000 });
  const incoming = trpc.pending.incoming.useQuery(undefined, { refetchInterval: POLL_MS });
  const outgoing = trpc.pending.myPending.useQuery(undefined, { refetchInterval: 60_000 });
  const participating = trpc.collection.myParticipating.useQuery(undefined, { refetchInterval: 60_000 });
  const mine = trpc.collection.myActive.useQuery(undefined, { refetchInterval: 60_000 });
  const milestones = trpc.milestone.list.useQuery(undefined, { refetchInterval: 60_000 });
  const accepted = useAcceptedRecent();

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
        photoUrl: p.fromUser.photoUrl,
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
        photoUrl: p.toUser.photoUrl,
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
        amountValue: row.amount,
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

    // My requests that were confirmed: the person who asked learns it here even when Telegram / push did not
    // reach them. The first-handshake milestone already says it for that one person.
    const firstWith = out.find((e) => e.kind === 'milestone' && e.milestone === 'FIRST_CONNECTION')?.personId;
    for (const a of accepted.items) {
      if (a.person.id === firstWith) continue;
      out.push({
        id: `acc:${a.id}`,
        kind: 'accepted',
        at: a.at,
        title: name(a.person.id, a.person.name),
        subtitle: t('circle.feed.accepted'),
        hot: a.unseen,
        personId: a.person.id,
        photoUrl: a.person.photoUrl,
      });
    }

    return out.sort((a, b) => b.at - a.at);
  }, [notifications.data, incoming.data, outgoing.data, mine.data, participating.data, milestones.data, accepted.items, myId, t, name, dateFmt]);

  // Active incoming Needs I have not decided on: unlike the feed rows (unread only) they stay after the Need was
  // opened, and end when I join, dismiss the notice, or the Need is no longer active (see isPendingRequest).
  const expiryTick = useExpiryTick(notifications.data?.items as unknown as NotificationItem[] | undefined);
  const impulses = useMemo<ImpulseNeed[]>(() => {
    // Until my Participations are known a Need I joined could flash up
    if (!notifications.data || !participating.data) return [];
    const joined = new Set<string>();
    for (const o of participating.data) {
      if (!o.unsubscribedAt && o.collection?.status === 'ACTIVE') joined.add(o.collection.id);
    }
    const now = Date.now();
    const byNeed = new Map<string, ImpulseNeed>();
    for (const n of notifications.data.items as unknown as NotificationItem[]) {
      const c = n.collection;
      if (!c || c.creatorId === myId || joined.has(c.id) || !isPendingRequest(n, now)) continue;
      const at = new Date(n.createdAt).getTime();
      const prev = byNeed.get(c.id);
      if (prev && prev.at >= at) continue;
      byNeed.set(c.id, { id: c.id, personId: c.creator.id, at, path: (n.handshakePathResolved ?? []).map((p) => p.id) });
    }
    return [...byNeed.values()].sort((a, b) => b.at - a.at);
    // expiryTick: the memo reads the clock, and the data keeps its identity while a notice runs out
  }, [notifications.data, participating.data, myId, expiryTick]);

  const loading =
    notifications.isLoading ||
    incoming.isLoading ||
    outgoing.isLoading ||
    participating.isLoading ||
    mine.isLoading ||
    milestones.isLoading;

  return { events, impulses, loading, unreadCount: unread.data?.count ?? 0, markAcceptedSeen: accepted.markSeen, dismissAccepted: accepted.dismiss };
}

/**
 * "Not for me": dismisses the request notices of a Need, which ends its impulse on the graph. The notices in
 * `dismissIds` go first, at once; the rest (the unread and read ones of the same Need) are swept in the background
 * after a list fetch, skipping `skipIds` (already being dismissed by the caller). Resolves true when the asked
 * dismissals worked (with no `dismissIds`: when the sweep did).
 */
export function useDeclineNeed() {
  const utils = trpc.useUtils();
  const dismiss = trpc.notification.dismiss.useMutation();
  // Typed by hand: the inferred result type is deep enough to trip the compiler
  const dismissOne = dismiss.mutateAsync as unknown as (input: { id: string }) => Promise<unknown>;
  return useCallback(
    async (collectionId: string, dismissIds: string[] = [], skipIds: string[] = []): Promise<boolean> => {
      const handled = new Set([...dismissIds, ...skipIds]);
      const known = Promise.all(dismissIds.map((id) => dismissOne({ id }).then(() => true, () => false)));
      const sweep = (async () => {
        try {
          const list = (await utils.client.notification.list.query({ limit: 100 })) as unknown as { items: NotificationItem[] };
          const rest = list.items.filter(
            (n) => n.collectionId === collectionId && !handled.has(n.id) && REQUEST_TYPES.has(n.type) && (n.status === 'UNREAD' || n.status === 'READ'),
          );
          const done = await Promise.all(rest.map((n) => dismissOne({ id: n.id }).then(() => true, () => false)));
          return done.every(Boolean);
        } catch {
          return false;
        }
      })();
      const [knownOk, sweepOk] = await Promise.all([known, sweep]);
      await Promise.all([
        utils.notification.list.invalidate(undefined, { refetchType: 'all' }),
        utils.notification.unreadCount.invalidate(undefined, { refetchType: 'all' }),
        utils.notification.attention.invalidate(undefined, { refetchType: 'all' }),
      ]);
      return dismissIds.length ? knownOk.every(Boolean) : sweepOk;
    },
    [utils, dismissOne],
  );
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
export const BANNER_KINDS: ReadonlySet<FeedKind> = new Set(['request', 'cycle', 'incoming', 'joined', 'closed', 'milestone', 'accepted']);

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
