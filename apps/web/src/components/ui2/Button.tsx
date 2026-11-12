import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'text' | 'textDanger' | 'icon';
export type ButtonSize = 'lg' | 'md' | 'sm';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Static pressed frame for the gallery. Pointer press still scales. */
  pressed?: boolean;
  icon?: ReactNode;
};

const tone: Record<ButtonVariant, string> = {
  primary: 'bg-care text-care-on hover:bg-care-hover',
  secondary: 'border border-line bg-surface text-ink hover:bg-surface-2',
  ghost: 'bg-canvas text-ink hover:bg-surface-2',
  danger: 'bg-sos text-sos-on hover:bg-sos-hover',
  text: 'bg-transparent text-ink-muted hover:text-ink',
  textDanger: 'bg-transparent text-sos',
  icon: 'border border-line bg-surface text-ink hover:bg-surface-2',
};

export function Button({
  variant = 'primary',
  size,
  loading = false,
  pressed = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps) {
  const resolved = size ?? (variant === 'icon' || variant === 'text' || variant === 'textDanger' ? 'sm' : 'lg');
  const box =
    variant === 'icon'
      ? resolved === 'md'
        ? 'h-10 w-10 rounded-md'
        : 'h-icon w-icon rounded-md'
      : variant === 'text' || variant === 'textDanger'
        ? 'min-h-small rounded-md px-2 text-body-s font-bold'
        : resolved === 'md'
          ? 'h-secondary rounded-lg px-4 text-body-s font-bold'
          : resolved === 'sm'
            ? 'h-small rounded-md px-3 text-caption font-bold'
            : 'h-primary rounded-lg px-4 text-body-l font-bold';

  return (
    <button
      type={type}
      disabled={disabled}
      aria-busy={loading || undefined}
      className={cn(
        'relative inline-flex items-center justify-center gap-2 whitespace-nowrap tracking-tight transition-[transform,background-color,color,border-color,opacity] duration-fast ease-so motion-reduce:transition-none',
        'so-focus',
        'active:scale-[0.96] disabled:pointer-events-none disabled:opacity-[0.45]',
        'motion-reduce:transition-none motion-reduce:active:scale-100',
        tone[variant],
        box,
        pressed && 'scale-[0.96]',
        loading && 'pointer-events-none',
        className,
      )}
      {...rest}
    >
      <span className={cn('inline-flex items-center justify-center gap-2', loading && 'invisible')}>
        {icon ? <span className="inline-flex h-5 w-5 shrink-0">{icon}</span> : null}
        {children}
      </span>
      {loading ? (
        <span className="so-spin absolute h-5 w-5 rounded-full border-2 border-current/40 border-t-current" />
      ) : null}
    </button>
  );
}
