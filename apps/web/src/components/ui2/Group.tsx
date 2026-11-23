import { useId, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { IconChevron } from './icons';
import { Switch } from './Switch';

type RowProps = {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  value?: string;
  chevron?: boolean;
  variant?: 'link' | 'value' | 'toggle' | 'danger' | 'plain';
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  to?: string;
  state?: unknown;
  onClick?: () => void;
  trailing?: ReactNode;
  /** Long titles and subtitles wrap instead of ending in an ellipsis */
  wrap?: boolean;
};

/** stagger: the rows come in one after another when the group mounts (lists of people, history). */
export function Group({
  title,
  children,
  className,
  stagger = false,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  stagger?: boolean;
}) {
  return (
    <section className={className}>
      {title ? <h2 className="mb-1.5 mt-4 px-1 text-label font-bold text-ink-muted">{title}</h2> : null}
      <div className={cn('divide-y divide-line-soft overflow-hidden rounded-lg bg-surface shadow-card', stagger && 'so-stagger')}>{children}</div>
    </section>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  value,
  chevron,
  variant = 'plain',
  checked = false,
  disabled = false,
  onCheckedChange,
  to,
  state,
  onClick,
  trailing,
  wrap = false,
}: RowProps) {
  const descriptionId = useId();
  const fit = wrap ? 'break-words' : 'truncate';
  const showChevron = chevron ?? (variant === 'link' || variant === 'value');
  const body = (
    <>
      {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center text-ink">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block text-body font-body', fit, variant === 'danger' ? 'text-sos' : 'text-ink')}>{title}</span>
        {subtitle ? <span className={cn('mt-0.5 block text-label font-semibold text-ink-muted', fit)}>{subtitle}</span> : null}
      </span>
      {variant === 'value' && value ? <span className="shrink-0 text-label font-semibold text-ink-muted">{value}</span> : null}
      {trailing}
      {showChevron ? <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" /> : null}
    </>
  );

  const className = 'so-focus flex min-h-row w-full items-center gap-3 px-4 py-2 text-start';
  // Tappable rows darken briefly under the finger
  const pressable = cn(className, 'transition-colors duration-fast ease-so active:bg-surface-2 motion-reduce:transition-none');

  if (variant === 'toggle') {
    return (
      <div className={className}>
        <button type="button" className="so-focus flex min-w-0 flex-1 items-center gap-3 text-start" disabled={disabled} onClick={() => onCheckedChange?.(!checked)}>
          {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center text-ink">{icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className={cn('block text-body font-body text-ink', fit)}>{title}</span>
            {subtitle ? <span id={descriptionId} className={cn('mt-0.5 block text-label font-semibold text-ink-muted', fit)}>{subtitle}</span> : null}
          </span>
        </button>
        <Switch checked={checked} label={title} describedBy={subtitle ? descriptionId : undefined} disabled={disabled} onCheckedChange={onCheckedChange ?? (() => undefined)} />
      </div>
    );
  }

  if (to) {
    return (
      <Link to={to} state={state} className={pressable} onClick={onClick}>
        {body}
      </Link>
    );
  }

  if (onClick || variant === 'danger' || variant === 'link') {
    return (
      <button type="button" className={pressable} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
