import type { ReactNode } from 'react';
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
  onCheckedChange?: (checked: boolean) => void;
  to?: string;
  onClick?: () => void;
  trailing?: ReactNode;
};

export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={className}>
      {title ? <h2 className="mb-1.5 mt-4 px-1 text-label font-bold text-ink-muted">{title}</h2> : null}
      <div className="divide-y divide-line-soft overflow-hidden rounded-lg bg-surface shadow-card">{children}</div>
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
  onCheckedChange,
  to,
  onClick,
  trailing,
}: RowProps) {
  const showChevron = chevron ?? (variant === 'link' || variant === 'value');
  const body = (
    <>
      {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center text-ink">{icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className={cn('block truncate text-body font-body', variant === 'danger' ? 'text-sos' : 'text-ink')}>{title}</span>
        {subtitle ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{subtitle}</span> : null}
      </span>
      {variant === 'value' && value ? <span className="text-label font-semibold text-ink-muted">{value}</span> : null}
      {trailing}
      {variant === 'toggle' ? (
        <Switch checked={checked} label={title} onCheckedChange={onCheckedChange ?? (() => undefined)} />
      ) : null}
      {showChevron ? <IconChevron className="h-[18px] w-[18px] shrink-0 text-ink-subtle" /> : null}
    </>
  );

  const className = 'so-focus flex min-h-row w-full items-center gap-3 px-4 py-2 text-left';

  if (variant === 'toggle') {
    return (
      <div className={className}>
        <button type="button" className="so-focus flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onCheckedChange?.(!checked)}>
          {icon ? <span className="grid h-9 w-9 shrink-0 place-items-center text-ink">{icon}</span> : null}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-body font-body text-ink">{title}</span>
            {subtitle ? <span className="mt-0.5 block truncate text-label font-semibold text-ink-muted">{subtitle}</span> : null}
          </span>
        </button>
        <Switch checked={checked} label={title} onCheckedChange={onCheckedChange ?? (() => undefined)} />
      </div>
    );
  }

  if (to) {
    return (
      <Link to={to} className={className} onClick={onClick}>
        {body}
      </Link>
    );
  }

  if (onClick || variant === 'danger' || variant === 'link') {
    return (
      <button type="button" className={className} onClick={onClick}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
