import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export type PillTone = 'neutral' | 'care' | 'warm' | 'sos' | 'link';

const toneClass: Record<PillTone, string> = {
  neutral: 'bg-surface-2 text-ink-muted',
  care: 'bg-care-soft text-care',
  warm: 'bg-warm-soft text-warm-ink',
  sos: 'bg-sos-soft text-sos',
  link: 'bg-link-soft text-link',
};

type PillProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: PillTone;
};

export function Pill({ tone = 'neutral', className, children, ...rest }: PillProps) {
  return (
    <span
      className={cn(
        'inline-flex h-[26px] items-center gap-1.5 rounded-sm px-2.5 text-micro font-bold',
        toneClass[tone],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
