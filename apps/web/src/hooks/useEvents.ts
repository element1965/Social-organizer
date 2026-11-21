import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { REGULAR_CYCLE_DAYS } from '@so/shared';
import { trpc } from '../lib/trpc';
import { CIRCLE_STALE_MS } from '../lib/circleLists';
import { useAuth } from './useAuth';
import { useAcceptedRecent } from './useAcceptedRecent';
import { formatIsolatedMoney, formatMoney } from '../components/ui2/format';

const DAY_MS = 24 * 60 * 60 * 1000;

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
  waitingForConfirmation?: boolean;
  personId?: string;
  /** The person on the row, for the avatars of a stacked card. */
  photoUrl?: string | null;
  collectionId?: string;
  /** The open notices the row stands for: read or dismissed together. */
  notificationIds?: string[];
  pendingId?: string;
  milestone?: MilestoneKind;
};

type Person = { id: string; name: string };

const REQUEST_TYPES = new Set(['NEW_COLLECTION', 'RE_NOTIFY', 'SPECIAL_AUTHOR', 'SPECIAL_DEVELOPER']);

/** Re-render when the next waiting request expires, even if the server data has not changed. */
export function useExpiryTick(expiries: number[]): number {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const now = Date.now();
    const next = expiries.reduce((nearest, expiry) => expiry > now ? Math.min(nearest, expiry) : nearest, Infinity);
    if (!Number.isFinite(next)) return;
    const timer = window.setTimeout(() => setTick((x) => x + 1), Math.min(next - now + 50, 2_000_000_000));
    return () => window.clearTimeout(timer);
  }, [expiries, tick]);
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
function cycleEnd(
  c: { currentCycleStart: string | Date | null; cycleNumber: number },
  type: string,
  wave?: number | null,
): Date | null {
  if (!c.currentCycleStart) return null;
  const current = new Date(c.currentCycleStart).getTime();
  const target = type === 'CYCLE_RENEWAL_REMINDER' ? (wave ?? c.cycleNumber) + 1 : (wave ?? c.cycleNumber);
  const start = current + (target - c.cycleNumber) * REGULAR_CYCLE_DAYS * DAY_MS;
  return new Date(start + (REGULAR_CYCLE_DAYS - 1) * DAY_MS);
}

/**
 * The Circle feed: unread notifications, incoming and outgoing acquaintance requests,
 * collections I take part in, my own open requests and fresh milestones — one list, newest first.
 * New events arrive without a reload through the shell's pulse (hooks/usePulse.ts), which re-reads these lists.
 */
export function useEvents(options: { displayName?: (id: string, fallback: string) => string } = {}) {
  const { t, i18n } = useTranslation();
  const myId = useAuth((s) => s.userId);
  const name = options.displayName ?? ((_id: string, fallback: string) => fallback);

  // No timers here: the shell's pulse (hooks/usePulse.ts) re-reads each list when its part of the pulse changes.
  // A return to the Circle within CIRCLE_STALE_MS shows them from memory (lib/circleLists.ts).
  const fresh = { staleTime: CIRCLE_STALE_MS };
  const notifications = trpc.notification.list.useQuery({ limit: 100, includeWaiting: true }, fresh);
  const incoming = trpc.pending.incoming.useQuery(undefined, fresh);
  const outgoing = trpc.pending.myPending.useQuery(undefined, fresh);
  const participating = trpc.collection.myParticipating.useQuery(undefined, fresh);
  const mine = trpc.collection.myActive.useQuery(undefined, fresh);
  const milestones = trpc.milestone.list.useQuery(undefined, fresh);
  const accepted = useAcceptedRecent();
  const utils = trpc.useUtils();
  const waiting = notifications.data?.waiting;
  const expiries = useMemo(() => (waiting ?? []).map((row) => new Date(row.expiresAt).getTime()), [waiting]);
  const expiryTick = useExpiryTick(expiries);
  const lastExpiryTick = useRef(expiryTick);
  useEffect(() => {
    if (lastExpiryTick.current === expiryTick) return;
    lastExpiryTick.current = expiryTick;
    void utils.notification.attention.invalidate();
  }, [expiryTick, utils]);
  const now = useMemo(() => Date.now(), [waiting, expiryTick]);

  const dateFmt = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { day: 'numeric', month: 'long' }),
    [i18n.language],
  );

  const events = useMemo<FeedEvent[]>(() => {
    const out: FeedEvent[] = [];
    const items = notifications.data?.items ?? [];

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

    const covered = new Set<string>();
    for (const n of waiting ?? []) {
      const c = n.collection;
      if (!c || new Date(n.expiresAt).getTime() <= now) continue;
      const path = n.handshakePathResolved;
      // Path runs from the author to me: the person next to me is the one I know.
      const near = path.length > 2 ? path[path.length - 2] : undefined;
      const kind = c.type === 'REGULAR' ? t('circle.feed.every') : t('circle.feed.once');
      covered.add(c.id);
      out.push({
        id: `n:request:${c.id}`,
        at: new Date(n.createdAt).getTime(),
        notificationIds: [n.id],
        collectionId: c.id,
        personId: c.creator.id,
        kind: 'request',
        title: name(c.creator.id, c.creator.name),
        subtitle: near
          ? t('circle.feed.requestVia', { name: name(near.id, near.name), kind })
          : t('circle.feed.request', { kind }),
        amount: c.amount != null ? formatMoney(c.amount) : undefined,
        amountValue: c.amount,
        hot: true,
      });
    }

    const cycleSubtitle = (end: Date | null, total: number) => {
      const date = end ? dateFmt.format(end) : '';
      return total > 0
        ? t('circle.feed.cycleWithAmount', { amount: formatIsolatedMoney(total), date })
        : t('circle.feed.cycle', { date });
    };

    const renewalIds = new Set<string>();
    for (const { collection: c, amount } of notifications.data?.waitingRenewals ?? []) {
      renewalIds.add(c.id);
      covered.add(c.id);
      out.push({
        id: `n:cycle:${c.id}`,
        at: c.currentCycleStart ? new Date(c.currentCycleStart).getTime() : 0,
        collectionId: c.id,
        personId: c.creator.id,
        kind: 'cycle',
        title: name(c.creator.id, c.creator.name),
        subtitle: cycleSubtitle(cycleEnd(c, 'CYCLE_RENEWED'), amount),
        hot: true,
        waitingForConfirmation: true,
      });
    }

    // The paginated activity still groups notices of the same kind for each Need.
    const rows = new Map<string, FeedEvent>();
    for (const n of items) {
      if (!n.collection || n.status !== 'UNREAD') continue;
      const c = n.collection;
      if (REQUEST_TYPES.has(n.type)) {
        joined.get(c.id)?.ids.push(n.id);
        continue;
      }
      const isCycle = n.type === 'CYCLE_RENEWED' || n.type === 'CYCLE_RENEWAL_REMINDER';
      if (isCycle && renewalIds.has(c.id)) continue;

      const key = `${isCycle ? 'cycle' : n.type}:${c.id}`;
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

      if (isCycle) {
        const end = cycleEnd(c, n.type, n.wave);
        const total = (c.obligations ?? []).reduce((sum, o) => sum + o.amount, 0);
        rows.set(key, {
          ...base,
          kind: 'cycle',
          title: creator,
          subtitle: cycleSubtitle(end, total),
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
            ? t('circle.feed.mineProgress', { collected: formatIsolatedMoney(col.currentAmount), goal: formatIsolatedMoney(col.amount) })
            : t('circle.feed.mineCollected', { collected: formatIsolatedMoney(col.currentAmount) }),
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
        subtitle: t('circle.feed.participating', { amount: formatIsolatedMoney(row.amount) }),
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
  }, [notifications.data, waiting, incoming.data, outgoing.data, mine.data, participating.data, milestones.data, accepted.items, myId, t, name, dateFmt, now]);

  // The same undecided Needs send an impulse through the graph, even after being opened.
  const impulses = useMemo<ImpulseNeed[]>(() => (
    (waiting ?? []).flatMap((n) => {
      if (!n.collection || new Date(n.expiresAt).getTime() <= now) return [];
      return [{
        id: n.collection.id,
        personId: n.collection.creator.id,
        at: new Date(n.createdAt).getTime(),
        path: n.handshakePathResolved.map((person) => person.id),
      }];
    }).sort((a, b) => b.at - a.at)
  ), [waiting, now]);

  const loading =
    notifications.isLoading ||
    incoming.isLoading ||
    outgoing.isLoading ||
    participating.isLoading ||
    mine.isLoading ||
    milestones.isLoading;

  return { events, impulses, loading, markAcceptedSeen: accepted.markSeen, dismissAccepted: accepted.dismiss };
}

/**
 * "Not for me": dismisses every open request notice of a Need (the visible ones, the read ones, older waves)
 * with one server call (`notification.dismissNeed`), which ends its impulse on the graph. The decision is
 * recorded whole or not at all, so a failure leaves the feed row in place to try again. Resolves to null when it
 * was recorded, or to the original error, so the caller can tell its kind once.
 */
export function useDeclineNeed() {
  const utils = trpc.useUtils();
  // The caller tells the person, once, from the result this resolves to
  const dismissNeed = trpc.notification.dismissNeed.useMutation({ meta: { notifyOnError: false } });
  const send = dismissNeed.mutateAsync;
  return useCallback(
    async (collectionId: string): Promise<unknown | null> => {
      let failure: unknown = null;
      try {
        await send({ collectionId });
      } catch (error) {
        failure = error ?? new Error('Dismiss failed');
      }
      void utils.notification.list.invalidate(undefined, { refetchType: 'all' });
      void utils.notification.unreadCount.invalidate(undefined, { refetchType: 'all' });
      void utils.notification.attention.invalidate(undefined, { refetchType: 'all' });
      if (!failure) void utils.collection.getById.invalidate({ id: collectionId });
      return failure;
    },
    [utils, send],
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
  if (event.waitingForConfirmation) return 'needs';
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
