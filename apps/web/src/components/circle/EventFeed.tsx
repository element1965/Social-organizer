import { useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EventRow } from '../ui2/EventRow';
import { IconBell, IconHand, IconPeople, IconUserPlus } from '../ui2/icons';
import { useAuth } from '../../hooks/useAuth';
import { FEED_GROUPS, feedGroup, type FeedEvent, type FeedGroup, type FeedKind } from '../../hooks/useEvents';
import { IconClock, IconClose, IconDone, IconFlag, IconPause, IconRepeat } from './icons';

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
            {group.rows.map((event) => {
              const dismissable = Boolean(event.notificationIds?.length);
              const remove = () => {
                // EventRow fires its click right after a swipe; swallow that click.
                swipedAt.current = Date.now();
                onDismiss(event);
              };
              return (
                <li
                  key={event.id}
                  className="group relative"
                  onKeyDown={(e) => {
                    if (dismissable && (e.key === 'Delete' || e.key === 'Backspace')) remove();
                  }}
                >
                  <EventRow
                    icon={ICONS[event.kind]}
                    title={event.title}
                    subtitle={event.subtitle}
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
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
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
