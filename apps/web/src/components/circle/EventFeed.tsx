import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EventRow } from '../ui2/EventRow';
import { Avatar } from '../ui2/Avatar';
import { formatMoney } from '../ui2/format';
import { cn } from '../../lib/utils';
import { IconBell, IconHand, IconPeople, IconUserPlus } from '../ui2/icons';
import { useAuth } from '../../hooks/useAuth';
import { FEED_GROUPS, feedGroup, type FeedEvent, type FeedGroup, type FeedKind } from '../../hooks/useEvents';
import { IconClock, IconClose, IconDone, IconFlag, IconPause, IconRepeat } from './icons';
import { IconChevron } from '../ui2/icons';
import { prefersReducedMotion } from '../ui2/presence';

/**
 * Same-kind rows fold into one card from this many on (two stay as rows: folding them saves nothing).
 * Needs waiting for a decision never fold: each is its own decision with its own author and amount; past
 * REQUEST_VISIBLE of them the rest wait behind "N more".
 */
const STACK_FROM: Partial<Record<FeedKind, number>> = { waiting: 3, incoming: 3, accepted: 2, participating: 3, closed: 3 };
const REQUEST_VISIBLE = 3;

type FeedItem =
  | { type: 'row'; event: FeedEvent }
  | { type: 'stack'; key: string; kind: FeedKind; events: FeedEvent[] }
  | { type: 'more'; key: string; events: FeedEvent[] };

/** Rows of one section, newest first: single rows, folded stacks (at the place of their newest row) and "N more". */
function feedItems(group: FeedGroup, rows: FeedEvent[]): FeedItem[] {
  const byKind = new Map<FeedKind, FeedEvent[]>();
  for (const e of rows) {
    const list = byKind.get(e.kind);
    if (list) list.push(e);
    else byKind.set(e.kind, [e]);
  }
  const items: FeedItem[] = [];
  const placed = new Set<FeedKind>();
  const hidden: FeedEvent[] = [];
  let requests = 0;
  let lastRequest = -1;
  for (const e of rows) {
    const from = STACK_FROM[e.kind];
    const same = byKind.get(e.kind)!;
    if (from && same.length >= from) {
      if (!placed.has(e.kind)) {
        placed.add(e.kind);
        items.push({ type: 'stack', key: `${group}:${e.kind}`, kind: e.kind, events: same });
      }
      continue;
    }
    if (e.kind === 'request') {
      if (requests++ >= REQUEST_VISIBLE) {
        hidden.push(e);
        continue;
      }
      items.push({ type: 'row', event: e });
      lastRequest = items.length - 1;
      continue;
    }
    items.push({ type: 'row', event: e });
  }
  if (hidden.length) items.splice(lastRequest + 1, 0, { type: 'more', key: `${group}:more`, events: hidden });
  return items;
}

const ICONS: Record<FeedKind, ReactNode> = {
  request: <IconBell className="h-5 w-5" />,
  mine: <IconFlag className="h-5 w-5" />,
  participating: <IconHand className="h-5 w-5" />,
  cycle: <IconRepeat className="h-5 w-5" />,
  closed: <IconDone className="h-5 w-5" />,
  blocked: <IconPause className="h-5 w-5" />,
  joined: <IconPeople className="h-5 w-5" />,
  incoming: <IconUserPlus className="h-5 w-5" />,
  waiting: <IconClock className="h-5 w-5" />,
  milestone: <IconDone className="h-5 w-5" />,
  accepted: <IconPeople className="h-5 w-5" />,
};

type EventFeedProps = {
  events: FeedEvent[];
  loading?: boolean;
  onOpen: (event: FeedEvent) => void;
  onDismiss: (event: FeedEvent) => void;
};

const GROUP_TITLE: Record<FeedGroup, string> = {
  needs: 'circle.feed.groupNeeds',
  mine: 'circle.feed.groupMine',
  helping: 'circle.feed.groupHelping',
  people: 'circle.feed.groupPeople',
};

/**
 * The Circle feed in sections by meaning (what waits for me, my Needs, Needs I am in, people), newest first inside
 * each. Rows of my own Needs carry the flag, rows of Needs I take part in the hand.
 */
export function EventFeed({ events, loading, onOpen, onDismiss }: EventFeedProps) {
  const { t } = useTranslation();
  const myId = useAuth((s) => s.userId);
  const swipedAt = useRef(0);
  // Open stacks and "N more" lists, by key; closed by default
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  // Rows being dismissed fold away first; the feed drops them once the fold is over
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const toggle = (key: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  if (loading && events.length === 0) {
    return (
      <div className="flex flex-col gap-2" aria-busy>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-16 animate-pulse rounded-[20px] bg-surface motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (events.length === 0) return <QuietFeed />;

  const byGroup = new Map<FeedGroup, FeedEvent[]>();
  for (const event of events) {
    const g = feedGroup(event, myId);
    const list = byGroup.get(g);
    if (list) list.push(event);
    else byGroup.set(g, [event]);
  }
  const groups = FEED_GROUPS.filter((g) => byGroup.has(g)).map((g) => ({
    key: g,
    label: t(GROUP_TITLE[g]),
    rows: byGroup.get(g)!.sort((a, b) => b.at - a.at),
  }));

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <h3 className="mx-1 mb-2 mt-1 flex items-baseline justify-between text-label font-bold text-ink-muted">
            <span>{group.label}</span>
            <span className="tabular-nums text-ink-subtle">{group.rows.length}</span>
          </h3>
          <ul className="flex flex-col gap-2 pb-2">
            {feedItems(group.key, group.rows).flatMap((item) => {
              if (item.type === 'row') return [renderRow(item.event)];
              const expanded = open.has(item.key);
              const head =
                item.type === 'stack' ? (
                  <li key={item.key}>
                    <StackCard kind={item.kind} events={item.events} expanded={expanded} onToggle={() => toggle(item.key)} />
                  </li>
                ) : (
                  <li key={item.key}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => toggle(item.key)}
                      className="so-focus mx-1 flex min-h-11 items-center gap-1 text-body-s font-bold text-care"
                    >
                      {expanded ? t('circle.feed.stack.less') : t('circle.feed.stack.more', { count: item.events.length })}
                      <IconChevron className={cn('h-4 w-4 transition-transform motion-reduce:transition-none', expanded ? '-rotate-90' : 'rotate-90')} />
                    </button>
                  </li>
                );
              // A stack opens its rows right under the card, "N more" right under its button
              return expanded ? [head, ...item.events.map(renderRow)] : [head];
            })}
          </ul>
        </section>
      ))}
    </div>
  );

  function renderRow(event: FeedEvent) {
              const dismissable = Boolean(event.notificationIds?.length);
              const remove = () => {
                // EventRow fires its click right after a swipe; swallow that click.
                swipedAt.current = Date.now();
                if (prefersReducedMotion()) {
                  onDismiss(event);
                  return;
                }
                setLeaving((prev) => new Set(prev).add(event.id));
                window.setTimeout(() => onDismiss(event), 240);
              };
              return (
                <li
                  key={event.id}
                  className="so-collapse"
                  data-state={leaving.has(event.id) ? 'closed' : 'open'}
                  onKeyDown={(e) => {
                    if (dismissable && (e.key === 'Delete' || e.key === 'Backspace')) remove();
                  }}
                >
                  <div className="group relative">
                    <EventRow
                      icon={ICONS[event.kind]}
                      title={event.title}
                      subtitle={event.subtitle}
                      note={event.note}
                      amount={event.amount}
                      hot={event.hot}
                      onClick={() => {
                        if (Date.now() - swipedAt.current < 400) return;
                        onOpen(event);
                      }}
                      onDismiss={dismissable ? remove : undefined}
                    />
                    {dismissable ? (
                      <button
                        type="button"
                        onClick={remove}
                        aria-label={t('circle.feed.dismiss', { name: event.title })}
                        className="so-focus absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-surface-2 text-ink-muted opacity-0 shadow-float transition-opacity focus:opacity-100 group-hover:opacity-100 motion-reduce:transition-none"
                      >
                        <IconClose className="h-3 w-3" />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
  }
}

const STACK_TITLE: Partial<Record<FeedKind, string>> = {
  waiting: 'circle.feed.stack.waiting',
  incoming: 'circle.feed.stack.incoming',
  accepted: 'circle.feed.stack.accepted',
  participating: 'circle.feed.stack.participating',
  closed: 'circle.feed.stack.closed',
};

/** One card for many rows of a kind: overlapped avatars, the count, who is in it; opens into the rows. */
function StackCard({ kind, events, expanded, onToggle }: { kind: FeedKind; events: FeedEvent[]; expanded: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const hot = events.some((e) => e.hot);
  const names = events.slice(0, 2).map((e) => e.title);
  const rest = events.length - names.length;
  const who = rest > 0 ? t('circle.feed.stack.names', { names: names.join(', '), count: rest }) : names.join(', ');
  const total = kind === 'participating' ? events.reduce((sum, e) => sum + (e.amountValue ?? 0), 0) : 0;
  return (
    <button
      type="button"
      aria-expanded={expanded}
      onClick={onToggle}
      className="so-event-in so-focus flex min-h-16 w-full items-center gap-3 rounded-[20px] bg-surface px-2.5 py-2.5 text-left shadow-card"
    >
      <span className="flex shrink-0 items-center">
        {events.slice(0, 3).map((e, i) => (
          <Avatar key={e.id} name={e.title} src={e.photoUrl} size={36} className={cn('ring-2 ring-surface', i > 0 && '-ml-5')} />
        ))}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-body font-body text-ink">
          <span className="truncate">{t(STACK_TITLE[kind] ?? '')}</span>
          <span className={cn('rounded-pill px-1.5 text-label font-bold tabular-nums', hot ? 'bg-care-soft text-care' : 'bg-surface-2 text-ink-muted')}>
            {events.length}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{who}</span>
      </span>
      {total > 0 ? <span className="text-body font-extrabold tabular-nums text-ink">{formatMoney(total)}</span> : null}
      <IconChevron className={cn('h-[18px] w-[18px] shrink-0 text-ink-subtle transition-transform motion-reduce:transition-none', expanded ? '-rotate-90' : 'rotate-90')} />
    </button>
  );
}

export function QuietFeed() {
  const { t } = useTranslation();
  return (
    <div className="mx-1 mt-4 text-center text-caption text-ink-muted">
      <b className="mb-1 block text-body font-bold text-ink">{t('circle.feed.quietTitle')}</b>
      {t('circle.feed.quietBody')}
    </div>
  );
}
