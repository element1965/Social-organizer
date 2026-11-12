import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type ChipProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'ring' | 'preset' | 'onscene' | 'action';
  active?: boolean;
  count?: string;
  /** Dot color token name used by ring chips. */
  dot?: 'ink' | 'node-2' | 'node-3' | 'care';
  children?: ReactNode;
};

const dotClass = {
  ink: 'bg-ink',
  'node-2': 'bg-node-2',
  'node-3': 'bg-node-3',
  care: 'bg-care',
} as const;

export function Chip({
  variant = 'ring',
  active = false,
  count,
  dot = 'ink',
  className,
  children,
  type = 'button',
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      className={cn(
        'relative inline-flex items-center justify-center gap-1 whitespace-nowrap font-bold',
        'transition-[background-color,color,border-color,box-shadow,transform,opacity] duration-fast ease-so active:scale-[0.95] motion-reduce:transition-none motion-reduce:active:scale-100',
        'before:absolute before:-inset-y-1.5 before:inset-x-0',
        'so-focus',
        variant === 'preset' && 'h-small rounded-md bg-surface px-3.5 text-body-s text-ink-muted shadow-float',
        variant === 'preset' && active && 'bg-ink text-canvas shadow-none',
        variant === 'ring' && 'h-chip rounded-md bg-surface px-2.5 text-micro text-ink-muted shadow-float',
        variant === 'ring' && active && 'text-ink',
        variant === 'action' && 'h-chip rounded-md bg-surface px-3 text-micro text-ink shadow-float',
        variant === 'action' && active && 'bg-care text-care-on shadow-none',
        variant === 'onscene' &&
          'h-[34px] rounded-md border border-node-1/15 bg-scene-2/80 px-2.5 text-micro text-node-2',
        variant === 'onscene' && active && 'border-transparent bg-care-bright text-scene',
        className,
      )}
      {...rest}
    >
      {variant === 'ring' ? <i className={cn('h-2 w-2 rounded-full', dotClass[dot])} /> : null}
      {count ? (
        <b
          className={cn(
            'text-caption font-extrabold tracking-tight',
            variant === 'onscene' ? 'text-node-1' : variant === 'preset' && active ? 'text-canvas' : 'text-ink',
          )}
        >
          {count}
        </b>
      ) : null}
      {children}
    </button>
  );
}
