import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        {
          'bg-surface-2 text-ink-muted': variant === 'default',
          'bg-care-soft text-care': variant === 'success',
          'bg-warm-soft text-amber-800 dark:text-amber-200': variant === 'warning',
          'bg-sos-soft text-sos': variant === 'danger',
          'bg-link-soft text-link': variant === 'info',
        },
        className
      )}
      {...props}
    />
  );
}
