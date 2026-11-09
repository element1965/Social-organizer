import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';

type CardProps = HTMLAttributes<HTMLElement> & {
  title?: string;
  subtitle?: string;
  children?: ReactNode;
};

export function Card({ title, subtitle, className, children, ...rest }: CardProps) {
  return (
    <section className={cn('rounded-r-xl bg-surface p-4 text-ink shadow-card', className)} {...rest}>
      {title ? <h2 className="text-title font-bold">{title}</h2> : null}
      {subtitle ? <p className={cn('text-caption font-semibold text-ink-muted', title && 'mt-1.5')}>{subtitle}</p> : null}
      {children ? <div className={cn((title || subtitle) && 'mt-3')}>{children}</div> : null}
    </section>
  );
}
