import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';

type EmptyStateProps = {
  title: string;
  /** What will appear here, in one sentence */
  body?: string;
  /** At most one next step: a Button or a Link styled as one */
  action?: ReactNode;
  /** card: on a surface of its own; plain: straight on the screen background */
  variant?: 'card' | 'plain';
  className?: string;
};

/** An empty list says what will appear in it and offers one next step (audit A8). */
export function EmptyState({ title, body, action, variant = 'card', className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'text-center',
        variant === 'card' ? 'rounded-lg bg-surface px-4 py-6 shadow-card' : 'px-2 py-8',
        className,
      )}
    >
      <p className="text-body font-bold text-ink">{title}</p>
      {body ? <p className="mx-auto mt-1 max-w-[34ch] text-body-s font-semibold text-ink-muted">{body}</p> : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}
