import { cn } from '../../lib/utils';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({ className, variant = 'primary', size = 'md', ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 disabled:pointer-events-none',
        {
          'bg-care text-care-on hover:bg-care-hover focus-visible:ring-care': variant === 'primary',
          'bg-surface-2 text-ink hover:bg-line focus-visible:ring-line-strong': variant === 'secondary',
          'border border-line-strong text-ink hover:bg-surface-2 focus-visible:ring-line-strong': variant === 'outline',
          'text-ink hover:bg-surface-2 focus-visible:ring-line-strong': variant === 'ghost',
          'bg-sos text-sos-on hover:bg-sos-hover focus-visible:ring-sos': variant === 'danger',
        },
        {
          'min-h-9 px-3 py-1.5 text-sm': size === 'sm',
          'min-h-11 px-4 py-2 text-sm': size === 'md',
          'min-h-12 px-6 py-3 text-base': size === 'lg',
        },
        className
      )}
      {...props}
    />
  );
}
