import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { EventRow } from '../ui2/EventRow';
import { IconBell, IconHand, IconUserPlus } from '../ui2/icons';
import type { FeedEvent, FeedKind } from '../../hooks/useEvents';
import { IconClock, IconDone, IconPause, IconRepeat } from './icons';

const ICONS: Record<FeedKind, ReactNode> = {
  request: <IconBell className="h-5 w-5" />,
  mine: <IconHand className="h-5 w-5" />,
  participating: <IconHand className="h-5 w-5" />,
  cycle: <IconRepeat className="h-5 w-5" />,
  closed: <IconDone className="h-5 w-5" />,
  blocked: <IconPause className="h-5 w-5" />,
  joined: <IconHand className="h-5 w-5" />,
  incoming: <IconUserPlus className="h-5 w-5" />,
  waiting: <IconClock className="h-5 w-5" />,
  milestone: <IconDone className="h-5 w-5" />,
};

type EventFeedProps = {
  events: FeedEvent[];
  loading?: boolean;
  onOpen: (event: FeedEvent) => void;
  onDismiss: (event: FeedEvent) => void;
  /** Group rows under "Today" / "Earlier" (phone sheet). The desktop column has its own heading. */
  dayLabels?: boolean;
};

function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

export function EventFeed({ events, loading, onOpen, onDismiss, dayLabels = false }: EventFeedProps) {
  const { t } = useTranslation();

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

  const today = startOfToday();
  const groups: Array<{ label: string | null; rows: FeedEvent[] }> = dayLabels
    ? [
        { label: t('circle.feed.today'), rows: events.filter((e) => e.at >= today) },
        { label: t('circle.feed.earlier'), rows: events.filter((e) => e.at < today) },
      ].filter((g) => g.rows.length > 0)
    : [{ label: null, rows: events }];

  return (
    <div className="flex flex-col">
      {groups.map((group) => (
        <section key={group.label ?? 'all'}>
          {group.label ? <h3 className="mx-1 mb-2 mt-1 text-label font-bold text-ink-muted">{group.label}</h3> : null}
          <ul className="flex flex-col gap-2 pb-2">
            {group.rows.map((event) => (
              <li key={event.id}>
                <EventRow
                  icon={ICONS[event.kind]}
                  title={event.title}
                  subtitle={event.subtitle}
                  amount={event.amount}
                  hot={event.hot}
                  onClick={() => onOpen(event)}
                  onDismiss={event.notificationId ? () => onDismiss(event) : undefined}
                />
              </li>
            ))}
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
