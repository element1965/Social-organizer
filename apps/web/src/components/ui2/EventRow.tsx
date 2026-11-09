import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { IconChevron } from './icons';

type EventRowProps = {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  amount?: string;
  hot?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
};

export function EventRow({ icon, title, subtitle, amount, hot = false, onClick, onDismiss }: EventRowProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef(0);
  const [offset, setOffset] = useState(0);

  const content = (
    <>
      <span
        className={cn(
          'grid h-[38px] w-[38px] shrink-0 place-items-center rounded-r-md',
          hot ? 'bg-care-soft text-care' : 'bg-surface-2 text-ink',
        )}
      >
        <span className="h-5 w-5">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-body text-ink">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{subtitle}</span> : null}
      </span>
      {amount ? <span className="text-body font-extrabold tabular-nums text-ink">{amount}</span> : null}
      <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
    </>
  );

  return (
    <div className="so-event-in overflow-hidden">
      <div
        className={cn(
          'flex min-h-16 items-center gap-3 rounded-[20px] bg-surface px-2.5 py-2.5 shadow-card',
          onClick && 'w-full text-left',
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(event) => {
          if (!onDismiss) return;
          start.current = { x: event.clientX, y: event.clientY };
          drag.current = 0;
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const dx = Math.min(0, event.clientX - start.current.x);
          drag.current = dx;
          setOffset(dx);
        }}
        onPointerUp={() => {
          if (drag.current < -72) onDismiss?.();
          start.current = null;
          drag.current = 0;
          setOffset(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          drag.current = 0;
          setOffset(0);
        }}
      >
        {onClick ? (
          <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">
            {content}
          </button>
        ) : (
          content
        )}
      </div>
    </div>
  );
}
