import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { IconBack } from './icons';

export type Crumb = { label: string; to?: string; onClick?: () => void };

export function MainBar({ back, title, action }: { back?: Crumb; title?: string; action?: ReactNode }) {
  return (
    <div className="sticky top-[var(--sa-top)] z-20 flex h-16 items-center gap-3.5 bg-canvas px-7">
      {back ? <CrumbLink crumb={back} size="md" /> : null}
      {title ? <h1 className="truncate text-h3 font-extrabold text-ink">{title}</h1> : null}
      {action ? <div className="ml-auto flex items-center gap-2.5">{action}</div> : null}
    </div>
  );
}

export function CrumbLink({ crumb, size }: { crumb: Crumb; size: 'md' | 'lg' }) {
  const navigate = useNavigate();
  const className =
    size === 'lg'
      ? 'so-focus inline-flex min-h-11 items-center gap-0.5 text-body-l font-bold tracking-tight text-care'
      : 'so-focus inline-flex min-h-11 items-center gap-0.5 text-body-s font-bold text-care';
  const icon = <IconBack className={size === 'lg' ? 'h-[22px] w-[22px]' : 'h-5 w-5'} />;
  if (crumb.to) {
    return (
      <Link to={crumb.to} className={className}>
        {icon}
        {crumb.label}
      </Link>
    );
  }
  return (
    <button type="button" className={className} onClick={crumb.onClick ?? (() => navigate(-1))}>
      {icon}
      {crumb.label}
    </button>
  );
}
