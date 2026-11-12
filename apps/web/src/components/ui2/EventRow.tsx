import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { prefersReducedMotion } from './presence';
import { IconChevron } from './icons';

type EventRowProps = {
  icon: ReactNode;
  title: string;
  subtitle?: ReactNode;
  /** Optional free text from the author, clamped to two lines. */
  note?: string;
  amount?: string;
  hot?: boolean;
  onClick?: () => void;
  onDismiss?: () => void;
};

export function EventRow({ icon, title, subtitle, note, amount, hot = false, onClick, onDismiss }: EventRowProps) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const drag = useRef(0);
  const [offset, setOffset] = useState(0);
  // While the finger drags, the row follows it 1:1; on release it eases back, or flies off before it is dismissed
  const [dragging, setDragging] = useState(false);

  const content = (
    <>
      <span
        className={cn(
          'grid h-[38px] w-[38px] shrink-0 place-items-center rounded-md',
          hot ? 'bg-care-soft text-care' : 'bg-surface-2 text-ink',
        )}
      >
        <span className="h-5 w-5">{icon}</span>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-body text-ink">{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{subtitle}</span> : null}
        {note ? <span dir="auto" className="mt-0.5 line-clamp-2 block break-words text-label font-semibold text-ink">{note}</span> : null}
      </span>
      {amount ? <span className="text-body font-extrabold tabular-nums text-ink">{amount}</span> : null}
      <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" />
    </>
  );

  return (
    // Clips the row while it is swiped away; rounded like the card, otherwise the clipped shadow
    // shows as dark square corners
    <div className="so-event-in overflow-hidden rounded-[20px]">
      <div
        className={cn(
          'flex min-h-16 items-center gap-3 rounded-[20px] bg-surface px-2.5 py-2.5 shadow-card',
          !dragging && 'transition-transform duration-base ease-so motion-reduce:transition-none',
          onClick && 'w-full text-left',
        )}
        style={{ transform: offset ? `translateX(${offset}px)` : undefined }}
        onPointerDown={(event) => {
          if (!onDismiss) return;
          start.current = { x: event.clientX, y: event.clientY };
          drag.current = 0;
          setDragging(true);
        }}
        onPointerMove={(event) => {
          if (!start.current) return;
          const dx = Math.min(0, event.clientX - start.current.x);
          drag.current = dx;
          setOffset(dx);
        }}
        onPointerUp={() => {
          const dismiss = drag.current < -72;
          start.current = null;
          drag.current = 0;
          setDragging(false);
          if (dismiss && onDismiss) {
            if (prefersReducedMotion()) {
              onDismiss();
              return;
            }
            setOffset(-(typeof window === 'undefined' ? 480 : window.innerWidth));
            window.setTimeout(onDismiss, 200);
            return;
          }
          setOffset(0);
        }}
        onPointerCancel={() => {
          start.current = null;
          drag.current = 0;
          setDragging(false);
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
